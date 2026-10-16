# E2E 테스트

Playwright(`playwright-core`)로 설치된 Chrome을 직접 띄워서 앱을 검증합니다. 브라우저를 따로 내려받지 않습니다.

## 실행

```bash
cd tests/e2e
npm install
npm test                       # 프로젝트 루트를 내장 로컬 서버로 열고 9개 묶음 실행
node run-all.js http://127.0.0.1:8123/PES_study_app_delta.html   # 이미 떠 있는 서버를 쓸 때
```

- Chrome 경로가 다르면 `CHROME_PATH="/path/to/chrome" npm test`
- 세 묶음을 따로 실행: `node 01-original.js`, `node 02-persistence.js`, `node 03-features.js`

## 묶음 설명

| 파일 | 내용 | 통과 기준(Day08 기준) |
|---|---|---|
| `01-original.js` | 원본 재현 흐름: 설정, 사다리 320단계, 자동 재생, 진행 바 시킹, 완료, 배너 0개 | 25 |
| `02-persistence.js` | 키보드 단축키, 진행 저장과 이어하기, 날짜 계산, 입력 검증 | 25 |
| `03-features.js` | 영작 모드 채점, 오답 저장과 재학습, 홀수/짝수 필터, 명시적 종료 | 41 |
| `04-data-layer.js` | fetch 데이터 로딩, 옛 저장(인덱스) → ID 변환, 없는 ID 무시, file:// 안내 | 11 |
| `05-day-select.js` | 단일 Day·기간(시작~끝) 드롭다운, 기간 제한, 제목·힌트, 틀린 문제 Day별 집계, 마지막 선택 기억, ?day= 링크, 진행 한 칸과 확인창 | 28 |
| `06-dialogue.js` | 대화형 4단계 흐름, 이전 버튼 규칙, 영작 세트 단위 오답, 혼합 Day16, 대화형 자동 재생 타이밍 | 44 |
| `07-ladder-units.js` | 반복 단위 슬라이더(0=교재 순, 1~8), 기본 4, 교재 순 320·504·582·249단계, 기간 Day 경계 묶음, 크기 1 그룹 병합, 저장·이어하기 | 32 |
| `08-mobile.js` | 모바일(390px·360px): 가로 넘침 없음, 설정 순서(학습모드 → 반복 단위 → 문제 범위), 터치 영역 44px 이상 | 29 |
| `09-tracking.js` | 방문 집계: 기본 꺼짐, 설정 시 방문(세션당 1회)·하트비트 전송, 새로고침 시 ID 유지, 숨김 중 중단, 전송 실패 무해, 학습 텍스트 미전송 | 17 |

## 알아둘 점
- 앱은 `data/*.json`을 `fetch`로 읽으므로 **반드시 HTTP 서버로 열어야 합니다.** `file://`로 열면 안내 문구가 뜨고 시작 버튼이 비활성화됩니다.
- 직접 서버를 띄우려면 `node serve.js 8123` (프로젝트 루트를 8123 포트로 제공).
- 테스트는 Tailwind CDN과 Google Fonts에 접속하므로 인터넷 연결이 필요합니다.
- 달력 예약 테스트는 외부 이동을 차단(`route.abort`)하고 URL만 확인합니다.
