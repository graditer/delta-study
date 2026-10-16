# 방문 집계 설정 안내 (Supabase)

앱에 들어온 사람 수를 세서 **일자별 방문자, 누적 방문자, 동시 접속자**를 기록합니다. 기록은 Supabase(무료 데이터베이스 서비스)에 쌓입니다. 이 문서는 Supabase를 처음 쓰는 사람을 기준으로 적었습니다.

> 현재 상태: 앱 코드는 들어가 있지만 **기본값이 꺼짐**입니다. 아래 "3. 앱에 연결하기"를 마치기 전까지는 아무것도 전송하지 않습니다.

## 0. 먼저 알아 둘 용어
| 용어 | 뜻 |
|---|---|
| Supabase | 인터넷에 있는 데이터 저장소입니다. 표(테이블)에 행을 넣고 조회할 수 있습니다. 무료로 시작할 수 있습니다. |
| 프로젝트 | Supabase 안의 독립된 데이터 공간입니다. 이 앱 전용으로 하나 만듭니다. |
| 테이블 | 엑셀 시트 같은 데이터 표입니다. 이 앱은 `visits`, `heartbeats`, `concurrent_log` 세 개를 씁니다. |
| SQL 편집기 | 표를 만드는 명령(SQL)을 입력하는 화면입니다. 이 문서의 SQL을 복사해 붙여 넣고 실행하면 됩니다. |
| anon 키 | 앱이 Supabase에 접속할 때 쓰는 공개 열쇠입니다. 웹 페이지 소스에 들어가도 괜찮습니다. |
| service_role 키 | 모든 권한을 가진 비밀 열쇠입니다. **앱 코드나 GitHub에 절대 넣지 않습니다.** |
| RLS | 행 단위 접근 규칙입니다. "앱은 기록만 넣을 수 있고, 남의 기록은 못 본다"를 여기서 정합니다. |
| 뷰(view) | 자주 쓰는 조회를 이름 붙여 저장한 것입니다. 대시보드가 이것을 읽습니다. |
| pg_cron | 정해진 시간마다 SQL을 자동 실행하는 기능입니다. 1분마다 동시 접속자 수를 기록할 때 씁니다. |

## 1. Supabase 계정과 프로젝트 만들기
1. https://supabase.com 에 접속해 **Start your project**(또는 Sign up)를 누르고 GitHub 또는 Google 계정으로 가입합니다.
2. 대시보드에서 **New project**를 누릅니다.
3. 입력 항목
   - Organization: 기본값 그대로 두면 됩니다.
   - Name: `delta-study` 처럼 알아볼 수 있는 이름
   - Database Password: 자동 생성된 값을 쓰고 **안전한 곳에 복사해 둡니다.** (다시 보기 어렵습니다)
   - Region: `Northeast Asia (Seoul)`를 고르면 한국에서 빠릅니다.
4. **Create new project**를 누르고 1~2분 기다립니다.

> 메뉴 이름과 화면은 Supabase 업데이트에 따라 조금 다를 수 있습니다. 비슷한 이름의 메뉴를 찾으면 됩니다.

## 2. 표 만들기 (SQL 실행)
1. 왼쪽 메뉴에서 **SQL Editor**를 엽니다.
2. **New query**를 누르고, 아래 블록 전체를 붙여 넣은 뒤 **Run**을 누릅니다.
3. 오류 없이 `Success`가 나오면 끝입니다. 한 번에 다 실행해도 되고, 이미 만든 것이 있으면 `if not exists` 덕분에 다시 실행해도 안전합니다.

```sql
-- 1) 표 만들기
create table if not exists visits (
  id bigint generated always as identity primary key,
  vid text not null,                 -- 브라우저 익명 ID (사람 이름 아님)
  session_id text not null,          -- 탭 하나의 익명 ID
  is_mobile boolean,                 -- 모바일 브라우저 여부
  created_at timestamptz not null default now()
);

create table if not exists heartbeats (
  session_id text primary key,       -- 탭 하나당 한 행만 유지 (30초마다 갱신)
  vid text not null,
  last_seen timestamptz not null default now()
);

create table if not exists concurrent_log (
  ts timestamptz primary key,        -- 1분 단위 시각
  users int not null                 -- 그 시각의 동시 접속자 수
);

-- 2) 보안: 앱(anon 키)은 기록만 넣을 수 있고, 읽을 수는 없게 한다
alter table visits enable row level security;
alter table heartbeats enable row level security;
alter table concurrent_log enable row level security;

create policy "anon insert visits" on visits for insert to anon with check (true);

-- 자동 노출을 껐을 때(권장)에도 앱이 기록할 수 있도록 필요한 권한만 직접 준다
grant insert on visits to anon;
grant usage on all sequences in schema public to anon;

-- 하트비트는 표에 직접 쓰지 않고 함수로만 기록한다 (anon에게 표 읽기 권한을 주지 않기 위해)
create or replace function touch_heartbeat(p_session_id text, p_vid text)
returns void language sql security definer set search_path = public as $
  insert into heartbeats (session_id, vid, last_seen)
  values (p_session_id, p_vid, now())
  on conflict (session_id) do update set vid = excluded.vid, last_seen = excluded.last_seen;
$;
revoke execute on function touch_heartbeat(text, text) from public;
grant execute on function touch_heartbeat(text, text) to anon;
-- concurrent_log에는 anon 정책을 만들지 않습니다 (앱은 이 표에 직접 쓰지 않음)

-- 3) 대시보드용 뷰 (날짜는 한국 시간 기준)
create or replace view daily_visitors as
select (created_at at time zone 'Asia/Seoul')::date as day,
       count(distinct vid) as visitors,
       count(*) as visits
from visits
group by 1
order by 1;

create or replace view cumulative_visitors as
with firsts as (
  select vid, min((created_at at time zone 'Asia/Seoul')::date) as day
  from visits
  group by vid
)
select day,
       count(*) as new_visitors,
       sum(count(*)) over (order by day) as cumulative
from firsts
group by day
order by day;

create or replace view concurrent_by_hour as
select date_trunc('hour', ts at time zone 'Asia/Seoul') as hour,
       max(users) as peak,
       round(avg(users), 1) as avg_users
from concurrent_log
group by 1
order by 1;

-- 뷰는 앱(anon)이 읽지 못하게 막는다. 대시보드는 Supabase 로그인 후 SQL 편집기나 서비스 키로 읽는다
revoke all on daily_visitors, cumulative_visitors, concurrent_by_hour from anon, authenticated;

-- 4) 1분마다 동시 접속자 수 기록 + 하루 지난 하트비트 정리 (pg_cron)
create extension if not exists pg_cron;

select cron.schedule('delta-concurrent-snapshot', '* * * * *', $$
  insert into concurrent_log (ts, users)
  select date_trunc('minute', now()), count(*)
  from heartbeats
  where last_seen > now() - interval '90 seconds'
  on conflict (ts) do update set users = excluded.users
$$);

select cron.schedule('delta-heartbeat-cleanup', '0 * * * *', $$
  delete from heartbeats where last_seen < now() - interval '1 day'
$$);
```

### 잘 됐는지 확인
- 왼쪽 **Table Editor**에서 `visits`, `heartbeats`, `concurrent_log` 세 표가 보이면 성공입니다.
- `pg_cron` 오류가 나면 **Database → Extensions**에서 `pg_cron`을 켠 뒤 4번 블록만 다시 실행합니다. 동시 접속자 기록만 빠지고 나머지는 그대로 동작합니다.

## 3. 앱에 연결하기
1. Supabase 왼쪽 메뉴 **Project Settings → API**(또는 **API Keys**)에서 두 값을 복사합니다.
   - **Project URL**: `https://xxxxxxxx.supabase.co` 형태
   - **anon public** 키: 긴 문자열 (**service_role 키는 복사하지 않습니다**)
2. `PES_study_app_delta.html`에서 아래 한 줄을 찾습니다.
   ```js
   const TRACK_CONFIG = { url: '', key: '', hosts: [] };
   ```
3. 다음처럼 채웁니다.
   ```js
   const TRACK_CONFIG = {
       url: 'https://xxxxxxxx.supabase.co',   // Project URL
       key: 'eyJhbGciOi...',                  // anon public 키
       hosts: ['내아이디.github.io']            // 배포 주소의 호스트 (주소 경로 제외)
   };
   ```
   - `hosts`는 **전송을 허용할 웹 주소**입니다. 여기 적힌 주소에서 열릴 때만 보냅니다. 내 컴퓨터(`localhost`)에서 여는 것은 기본적으로 보내지 않습니다.
   - GitHub Pages 주소가 `https://내아이디.github.io/my-english-trainers/...` 라면 호스트는 `내아이디.github.io` 입니다.
4. Supabase Table Editor에서 `visits` 행이 생기면 연결된 것입니다.

### 내 컴퓨터에서 실제로 보내 보기 (선택)
배포 전에 확인하고 싶다면 `hosts`에 `'localhost'`를 잠시 넣고 `python3 -m http.server 8000`으로 연 뒤, Supabase Table Editor에서 `visits` 행이 생기는지 봅니다. 확인이 끝나면 `'localhost'`를 **반드시 지웁니다.** (내 기록이 통계에 섞이지 않게 하기 위해서입니다.)

## 4. 결과 보기
Supabase **SQL Editor**에서 아래 조회를 실행합니다. 차트 화면은 나중에 Looker Studio 같은 도구로 만들면 됩니다.

```sql
-- 일자별 방문자 (한국 시간)
select * from daily_visitors order by day;

-- 누적 방문자 (날짜별 신규와 누계)
select * from cumulative_visitors order by day;

-- 시간대별 동시 접속자 (최대·평균)
select * from concurrent_by_hour order by hour desc limit 72;

-- 지금 이 순간 접속자 수 (최근 90초 기준)
select count(*) as now_users from heartbeats where last_seen > now() - interval '90 seconds';
```

> 뷰는 앱이 읽지 못하도록 막아 두었으므로, 위 조회는 **로그인한 대시보드(SQL Editor)에서만** 됩니다.

## 5. 집계 정의와 한계
- **방문자**: 브라우저(저장소) 단위입니다. 같은 사람이 폰과 PC로 들어오면 2명으로 셉니다. 브라우저 데이터를 지우면 새 방문자로 셉니다. 오차는 허용하기로 했습니다.
- **방문**: 탭을 새로 열 때 1회입니다. 새로고침은 같은 방문으로 봅니다.
- **동시 접속자**: 최근 90초 안에 "아직 보고 있어요" 신호(30초마다)를 보낸 탭 수입니다. 탭을 닫으면 최대 90초 뒤 빠집니다.
- **전송 방식**: 이름, 이메일, IP는 저장하지 않습니다. 학습 문장과 영작 입력도 보내지 않습니다.
- **악용 가능성**: anon 키는 공개되어 있어 누구나 기록을 넣을 수 있습니다. 통계 용도로는 충분하지만, 정확한 숫자가 필요한 용도에는 쓰지 않습니다.

## 6. 개인정보와 안내 문구
- 익명 ID만 쓰므로 개인을 특정하지 않습니다. 화면에 별도 안내 문구는 넣지 않았습니다. 이름·이메일·IP 같은 민감 정보를 수집하지 않기 때문입니다. 법률 판단이 필요하면 전문가에게 확인하는 것을 권합니다.
- 배포 저장소에 **service_role 키를 넣지 않았는지** 꼭 확인합니다.

## 7. 체크리스트
- [ ] Supabase 프로젝트 생성 (Seoul 리전)
- [ ] SQL 블록 실행, 표 3개 확인
- [ ] (선택) pg_cron 확장 켜기 후 cron 두 개 등록 확인
- [ ] Project URL과 anon 키 복사 (service_role 키 제외)
- [ ] `TRACK_CONFIG`에 url, key, 배포 호스트 입력
- [ ] 배포 후 실제 주소로 열어 `visits` 행이 생기는지 확인
- [ ] 내 컴퓨터에서 테스트했다면 `localhost` 제거
