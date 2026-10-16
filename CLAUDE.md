# PES Delta 학습 앱 — 프로젝트 안내

영어 패턴 드릴링 앱 ("Delta 스터디"). 사다리/랜덤 학습, 영작 채점, 틀린 문제 재학습, 대화형(A/B), 다크 모드를 지원한다. **사용자는 주로 모바일(390px·360px)로 쓴다.**

## 실행
- 앱: `PES_study_app_delta.html` (빌드 없는 단일 HTML, Tailwind Play CDN, 바닐라 JS)
- **반드시 HTTP 서버로 연다.** `file://`는 데이터를 못 읽는다. 예: `python3 -m http.server 8000` → `http://localhost:8000/PES_study_app_delta.html`
- `?day=N`: 해당 Day를 단일 범위로 연다 (저장된 범위보다 우선)
- E2E: `cd tests/e2e && npm install && npm test` (9개 묶음, 자세한 내용은 `tests/e2e/README.md`)

## 파일 구조
- `PES_study_app_delta.html`: 앱 본체
- `data/days.json`: Day 목록 (`{day, id, title, topic, format, count, file}`)
- `data/dayNN.json`: Day별 문제 (16개, Day10·18은 원본 404라 없음). 수정은 이 파일을 직접 고친다.
- 항목 형식: 문장형 `{id, num, group, type:"sentence", kr, en}` / 대화형 `{id, num, group, type:"dialogue", a_kr, a_en, b_kr, b_en}`, `id = "dayNN:num"`
- `tests/e2e/`: Playwright E2E 9개 묶음 + `serve.js` + `run-all.js`
- `docs/PLAN-day-sheet.md`: 개발 계획(승인본, 현재 상태보다 오래됨). `docs/SOURCE-NOTES.md`: 원본 분석. `docs/ANALYTICS.md`: 방문 집계 설정
- 원본 수집 스크립트(`tools/`)와 원본 기록(`data/raw/`)은 삭제했다(복구 불가). 구글 시트 동기화(Phase 6)는 제외했다.

## 기능
- **범위**: 단일 Day 드롭다운 또는 기간(시작·끝 드롭다운, 끝은 시작 이후만). 기간 안의 Day를 Day 순서대로 합쳐 출제하고, 교재 순 묶음은 Day마다 따로 만든다. 마지막 선택을 기억한다(`delta:lastRange`).
- **학습모드**: 사다리 / 랜덤
- **반복 단위(사다리 전용)**: 슬라이더 0~8, 기본 4. 0 = "교재"(번호 그룹 단위, 1문항 그룹이 연속되면 최대 4개씩 묶음), 1~8 = 그 개수씩 누적 반복. 한 줄 힌트에 총 단계 수를 보여 준다.
- **문제 범위**: 전체 / 틀린 문제 N개(선택한 범위 안의 수). 틀린 문제는 사다리에서도 교재 순으로 1회씩 나온다.
- **문제 필터**: 전체 / 홀수 / 짝수 (그룹 번호 기준)
- **영작 모드**: 상단 줄 왼쪽 알약 스위치(라벨 "영작 모드"). 입력을 정규화(대소문자·구두점·n't→not)해 채점한다. 빈 답안은 채점하지 않는다. 영작 모드 중에는 자동 재생이 꺼진다.
- **틀린 문제**: Day별로 저장한다(`delta:{dayId}:wrong`). 영작 모드에서 채점할 때만 바뀐다(틀리면 추가, 채점 단계가 모두 맞으면 제거). 영작 모드가 꺼져 있으면 목록은 그대로이고, 설정 화면에 이 조건과 경고가 나온다.
- **자동 재생**: 문장형 생각 4.5초 / 정답 공개 3.0초, 대화형 4.0초 / 2.5초. 설정 화면의 자동 재생 스위치는 제거했다(사용 안 함). 학습 중 "자동 전환"으로만 켠다.
- **대화형(Day14·15·16)**: A 질문 → A 정답 → B 질문(A 대사 맥락 박스) → B 정답 → 다음 세트. 이전 버튼은 세트 안에서 한 단계씩 되돌린다. Day16의 문장 항목은 초록 "문장" 배지로 2단계.
- **키보드**: Space/Enter 다음, ← 이전 (영작 입력창에 포커스가 있으면 Space는 공백)
- **진행 저장·이어하기**: 단계가 바뀔 때마다 저장한다. 진행은 한 칸(`delta:progress`)만 쓰며 범위와 설정을 함께 저장한다. 이어하기 버튼은 "이어서 연습하기 (Step n / N)"로 진행률만 보여 준다. 저장된 진행이 있는데 새로 시작하면 확인창을 띄운다. 대화형은 세트 처음부터 다시 시작한다.
- **명시적 종료**: 홈 버튼, "그냥 종료하기", "홈으로 돌아가기"는 진행 저장을 지우고 새로고침한다.
- **완료 화면 (2단계)**: 1단계는 완료 문구, 복습 알림(Google Calendar 링크, 1~30일), 틀린 문제로 연습했을 때만 "틀린 문제 목록 정리", 그냥 종료하기. 2단계는 틀린 문제 정리(전체 선택, 체크한 문제 지우기, 전체 비우기). 정리할 문제가 없으면 "홈으로 돌아가기"로 바뀐다.
- **다크 모드**: 상단 줄 오른쪽 스위치 알약. 라벨은 이모지(크게) + 모드 이름, 띄어쓰기 없이 표시한다("☀️라이트" / "🌙다크"). 손잡이에는 이모지를 넣지 않는다. 스위치 켜짐 = 다크. 알약 너비는 영작 모드 알약과 같다(132px). 왼쪽의 영작 알약과 같은 모양·폭. 선택은 `delta:theme`에 저장한다. 학습 화면에는 토글이 없다.
- **방문 집계(기본 꺼짐)**: `TRACK_CONFIG`(url, key, hosts)를 채운 호스트에서만 Supabase로 보낸다. 방문(세션당 1회)과 30초 하트비트만 보내며 학습 텍스트·입력은 보내지 않는다.

## 설정 화면 순서 (모바일)
상단 줄(왼쪽 영작 · 오른쪽 다크 모드) → 앱 이름 → 제목 → 범위 → 학습모드 → 반복 단위(사다리만) → 문제 범위 → 문제 필터 → 한 줄 힌트 → 이어서 연습하기(저장된 진행이 있을 때) → 연습 새로 시작하기

## 저장소 키
- localStorage `delta:progress`: 진행 위치, 문항 ID 순서, 범위(scope, start, end, label), 설정(playMode, poolMode, parity, chunkSize(0=교재), grade)
- localStorage `delta:{dayId}:wrong`: 틀린 문항 ID 배열
- localStorage `delta:lastRange`: 마지막 범위 `{scope, start, end}` (이전 버전의 `delta:lastDay`는 1회 이어받는다)
- localStorage `delta:theme`: `'dark'` / `'light'`
- `delta:vid`(localStorage), `delta:sid`(sessionStorage): 방문 집계용 익명 ID. 개인 정보가 아니다.
- 모든 접근은 try/catch로 감싼다 (사생활 보호 모드 등에서도 동작해야 함).

## 작업 규칙
- **모바일 우선.** UI를 바꾸면 390px·360px에서 확인한다. 가로 넘침이 없어야 하고, 터치 영역은 44px 이상이다(체크박스는 label 기준).
- 한국어로 소통한다.
- 큰 변경(데이터 구조, 저장 형식, 여러 파일)은 코딩 전에 계획을 먼저 확인받는다.
- 원본 동작을 임의로 바꾸지 않는다. 바꾸려면 이유와 함께 먼저 알린다.
- 제안만 하고 사용자가 고르기 전에는 코드를 바꾸지 않는다. "바꾸지 말자"라고 하면 그 문구를 그대로 둔다.
- **커밋과 푸시는 사용자가 요청할 때만 한다.** 이 폴더(`PES_delta_study_code`)가 앱 전용 Git 저장소의 루트다(브랜치 `main`). 커밋은 아직 없다. GitHub Pages 배포로 공개할 예정이므로 `.gitignore`(node_modules, .DS_Store)를 유지한다.
- `TRACK_CONFIG`: url·key(publishable)는 설정 완료, hosts는 배포 호스트 `graditer.github.io`만 둔다. localhost는 `hosts`에 넣지 않는다. 테스트에서 필요하면 브라우저 안에서만 임시로 추가한다.
- 수정 후에는 E2E 9개 묶음을 실행해 결과 개수를 보고한다.

## E2E 기준값
| 묶음 | 내용 | 결과 |
|---|---|---|
| 01-original | 원본 동작 | 26 |
| 02-persistence | 저장·이어하기 | 25 |
| 03-features | 기능 | 40 |
| 04-data-layer | 데이터 계층 | 11 |
| 05-day-select | 범위 선택, 틀린 문제 Day별, 진행 한 칸, 확인창 | 28 |
| 06-dialogue | 대화형 | 44 |
| 07-ladder-units | 반복 단위(0 / 1~8), 기본 4, 기간 교차 | 32 |
| 08-mobile | 모바일 390/360px | 29 |
| 09-tracking | 방문 집계(가짜 Supabase로 검사) | 17 |

## 현재 상태 (기준: 2026-10-16, Asia/Seoul)
- 개발 Phase 0~9 완료 (Phase 6 제외). 이후 설정 화면 개편(범위 선택, 반복 단위 통합, 틀린 문제 Day별, 상단 알약 버튼, 자동 재생 설정 제거)까지 반영. 커밋 없음.
- 방문 집계: Supabase(조직 Delta Loop, 프로젝트 delta-study, 서울)와 표·권한·함수 설정 완료. 실제 전송 확인 완료(visits 201, touch_heartbeat 204). GitHub 사용자 이름은 `graditer`.
- 실사용 중. 피드백을 받아 수정한다.
- 열린 항목
  - 커밋과 GitHub 연결 방식 (사용자 결정 대기)
  - 배포 방식 (GitHub Pages 등 / 로컬만). 배포 시 `TRACK_CONFIG.hosts`도 함께 설정
  - 긴 Day 주제명은 모바일 드롭다운에서 말줄임표로 표시한다 (사용자 허용)
  - 역사 기록용 문서(`docs/`)에는 옛 스크립트 이름이 남아 있다
- 계획 문서(`docs/PLAN-day-sheet.md`)의 Phase 상태는 오래되었다. 기준은 이 파일이다.
