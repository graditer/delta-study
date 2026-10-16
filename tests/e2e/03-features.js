// 3단계 검증: node run3.js <file-url>
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const withDay8 = u => { const x = new URL(u); if (!x.searchParams.has('day')) x.searchParams.set('day', '8'); return x.href; }; // 이 묶음은 Day 08을 기준으로 검사한다
const url = withDay8(process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html'); // serve.js 로 띄운 주소

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await page.route(/google\.com\/calendar/, r => r.abort());

  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const text = sel => page.textContent(sel);
  const visible = sel => page.isVisible(sel);
  const stepNum = async () => parseInt((await text('#progress-text')).match(/Step (\d+)/)[1]);
  const wrongStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('delta:day08:wrong') || '[]'));

  // 0. 정규화 함수 단위 검증
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(800);
  const norm = await page.evaluate(() => [
    normalizeEn("Don't you watch TV on the weekend?") === normalizeEn("do not you watch tv on the weekend"),
    normalizeEn("I watch TV on the weekend.") === normalizeEn("i watch tv on the weekend"),
    normalizeEn("I  watch   TV on the weekend!") === normalizeEn("I watch TV on the weekend"),
    normalizeEn("Steve's coffee") === normalizeEn("steve's coffee"),
    normalizeEn("I watch TV") !== normalizeEn("I watch TV on the weekend"),
    normalizeEn("I don't") !== normalizeEn("I do")
  ]);
  check('normalize: contraction, case, punctuation, spacing', norm.slice(0, 4).every(Boolean), JSON.stringify(norm));
  check('normalize: different sentences stay different', norm.slice(4).every(Boolean));

  // 1. 설정: 오답 없음 → 오답 범위 비활성
  check('wrong pool disabled when no wrong items', await page.isDisabled('#pool-wrong'));
  check('wrong count shows 0', (await text('#wrong-count')) === '0');

  // 2. 홀수 + 사다리 chunk=4 → 32문장 → 160 단계
  await page.click('#parity-odd');
  const oddPool = await page.evaluate(() => getPool().length);
  check('odd pool = 32 sentences (groups 1,3,...,15)', oddPool === 32, String(oddPool));
  await page.click('text=연습 새로 시작하기');
  check('odd ladder: 160 steps', (await text('#progress-text')).includes('/ 160'), await text('#progress-text'));
  check('odd: all sentences are odd-group', await page.evaluate(() => studySequence.every(s => parseInt(s.data.num) % 2 === 1)));
  check('badge shows 홀수', (await text('#badge-playmode')).includes('홀수'), await text('#badge-playmode'));

  // 3. 영작 판별 + 정답 채점 (Step 1 = 1.(1) "I watch TV on the weekend.")
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(500);
  await page.click('#parity-odd');
  // 영작 ON 후 시작 (영작 모드 중에는 자동 재생 상태가 꺼진다)
  await page.evaluate(() => { isAutoMode = true; });
  await page.click('#grade-mode-btn');
  check('grade ON turns auto mode OFF', (await page.evaluate(() => isAutoMode)) === false);
  check('grade switch: aria-checked=true, label 영작 모드', (await page.getAttribute('#grade-mode-btn', 'aria-checked')) === 'true' && (await text('#grade-mode-btn')).includes('영작 모드'));
  await page.click('text=연습 새로 시작하기');
  check('answer box visible in grade mode', await visible('#answer-box'));
  check('input focused on render', await page.evaluate(() => document.activeElement.id === 'answer-input'));
  await page.keyboard.type('i watch tv on the weekend');
  await page.keyboard.press('Enter');
  check('correct answer judged (case/punctuation ignored)', (await text('#judge-text')).includes('맞음'), await text('#judge-text'));
  check('English revealed after Enter submit', !(await page.getAttribute('#en-box', 'class')).includes('invisible'));
  check('input disabled after reveal', await page.isDisabled('#answer-input'));
  check('correct answer does not enter wrong list', (await wrongStored()).length === 0);

  // 4. 다음 단계 (Space) → 2번째 문항(1.(1) 반복) 건너뛰고 3번째: 1.(2)
  // 영작 모드에서는 단계 이동 후 입력창에 포커스가 가므로 Space 대신 입력 후 Enter로 진행
  await page.keyboard.press('Space');
  check('Space after reveal advances to step 2', (await stepNum()) === 2, `Step ${await stepNum()}`);
  check('input focused on new step', await page.evaluate(() => document.activeElement.id === 'answer-input'));
  await page.keyboard.type('I watch TV on the weekend');
  await page.keyboard.press('Enter');
  check('step 2 judged 맞음', (await text('#judge-text')).includes('맞음'));
  await page.keyboard.press('Space');
  check('Space advances to step 3', (await stepNum()) === 3, `Step ${await stepNum()}`);
  // Step 3 = 1.(2) "Do you watch TV on the weekend?" → 틀린 답
  await page.keyboard.type('You watch TV?');
  await page.keyboard.press('Enter');
  check('wrong answer judged 틀림 with user answer', (await text('#judge-text')).includes('틀림') && (await text('#judge-text')).includes('You watch TV?'), await text('#judge-text'));
  const w1 = await wrongStored();
  const idx12 = 'day08:1.(2)'; // 저장은 문항 ID 기준
  check('wrong item saved to localStorage', w1.length === 1 && w1[0] === idx12, JSON.stringify(w1));

  // 5. 빈 답안은 채점하지 않음
  await page.keyboard.press('Enter'); // 입력 없이 Enter → 공개만, 채점 안 함
  check('empty answer not judged', !(await visible('#judge-text')));
  check('empty answer not stored as wrong', (await wrongStored()).length === 1);

  // 6. 홈 → 진행 유지(이어하기 가능) + 오답 목록 유지
  await page.click('button[title="홈 (진행 저장 유지)"]');
  await page.waitForTimeout(800);
  check('home keeps progress (resume button shown)', await visible('#resume-btn'));
  check('quit keeps wrong list: wrong tab enabled', !(await page.isDisabled('#pool-wrong')));
  check('wrong count shows 1 after quit', (await text('#wrong-count')) === '1');

  // 7. 오답 재학습: 1문항 → 사다리 1 step, 진행바 NaN 없음
  await page.click('#pool-wrong');
  await page.click('text=연습 새로 시작하기');
  check('wrong mode: single item → Step 1 / 1', (await text('#progress-text')).includes('Step 1 / 1'), await text('#progress-text'));
  const barW = await page.getAttribute('#progress-bar', 'style');
  check('progress bar width not NaN for 1 item', !barW.includes('NaN'), barW);
  check('badge shows 오답', (await text('#badge-playmode')).includes('오답'));
  // 같은 문항을 정답으로 맞히면 오답 목록에서 제거됨
  await page.click('button[title="홈 (진행 저장 유지)"]');
  await page.waitForTimeout(800);
  await page.click('#pool-wrong');
  if (!(await page.evaluate(() => gradeOn))) await page.click('#grade-mode-btn'); // 홈 복귀 시 영작 설정이 복원되므로, 꺼져 있을 때만 켠다
  await page.click('text=연습 새로 시작하기');
  await page.keyboard.type('Do you watch TV on the weekend?');
  await page.keyboard.press('Enter');
  check('retry with correct answer judged 맞음', (await text('#judge-text')).includes('맞음'));
  check('correct retry removes item from wrong list', (await wrongStored()).length === 0);

  // 8. 틀린 문제 0개 → 오답 범위 비활성 & 선택 시 방어
  await page.click('button[title="홈 (진행 저장 유지)"]');
  await page.waitForTimeout(800);
  check('wrong pool disabled again after clearing', await page.isDisabled('#pool-wrong'));

  // 9. 짝수 + 랜덤: 짝수 그룹만, 중복 없음
  await page.click('#tab-random');
  await page.click('#parity-even');
  await page.click('text=연습 새로 시작하기');
  const evenRand = await page.evaluate(() => ({
    len: studySequence.length,
    allEven: studySequence.every(s => parseInt(s.data.num) % 2 === 0),
    uniq: new Set(studySequence.map(s => s.data.num)).size
  }));
  check('even random: 32 items, all even, unique', evenRand.len === 32 && evenRand.allEven && evenRand.uniq === 32, JSON.stringify(evenRand));

  // 10. 영작 ON 세션을 이어하기 시 판별 상태 복원
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => gradeOn))) await page.click('#grade-mode-btn'); // 홈 복귀 후 설정이 복원되므로 꺼져 있을 때만 켠다
  await page.click('text=연습 새로 시작하기');
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.waitForTimeout(400);
  check('resume button after reload in grade session', await visible('#resume-btn'));
  await page.click('#resume-btn');
  check('resumed grade session keeps answer box', await visible('#answer-box'));
  check('resumed grade session keeps auto mode OFF', (await page.evaluate(() => isAutoMode)) === false);

  // 11. 완료 시 저장 삭제 (기존 동작 회귀)
  await page.evaluate(() => { currentIdx = studySequence.length - 1; render(); });
  await page.keyboard.press('Enter'); // 영작 모드: 입력창 포커스 → Enter로 공개
  await page.keyboard.press('Enter'); // 공개 후 입력창 blur → Enter로 다음(완료)
  check('finish overlay shown', await visible('#finish-ui'));
  check('finish clears saved progress', (await page.evaluate(() => localStorage.getItem('delta:day08:progress'))) === null);

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
