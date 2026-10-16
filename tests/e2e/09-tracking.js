// 방문 집계 검증: 기본은 꺼짐, 설정 시 방문·하트비트 전송, 세션당 방문 1회, 숨김 중 중단, 전송 실패 무해
// 실제 Supabase에 보내지 않도록 가짜 주소(fake-supabase.test)로 요청을 가로채서 검사한다.
// usage: node 09-tracking.js [app-url]
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:8123/PES_study_app_delta.html';
const FAKE = 'https://fake-supabase.test';
const ALLOWED_VISIT_KEYS = ['vid', 'session_id', 'is_mobile'];
const ALLOWED_BEAT_KEYS = ['p_session_id', 'p_vid'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const results = [];
  const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  const cors = req => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': req.headers()['access-control-request-headers'] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  const enableTracking = () => {
    // 테스트 전용: 가짜 주소와 현재 호스트를 허용 목록에 넣고 집계를 다시 시작한다
    TRACK_CONFIG.url = 'https://fake-supabase.test';
    TRACK_CONFIG.key = 'test-anon-key';
    TRACK_CONFIG.hosts.push(location.hostname);
    initTracking();
  };

  // 1. 기본값: 전송 없음, 안내 문구 숨김
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const sent = [];
    await page.route(`${FAKE}/**`, r => { sent.push(r.request().url()); r.fulfill({ status: 201, body: '' }); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => dayItems.length > 0);
    await page.waitForTimeout(300);
    const cfg = await page.evaluate(() => !trackOn()); // 테스트 주소(localhost)는 허용 호스트가 아니므로 꺼져 있어야 함
    check('tracking is off on a non-deployed host', cfg);
    check('no requests sent while tracking is off', sent.length === 0, `sent=${sent.length}`);
    await context.close();
  }

  // 2. 설정을 켜면 방문 1회 + 하트비트 1회 전송, 안내 문구 표시
  const reqs = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.route(`${FAKE}/**`, async r => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors(req) });
    const u = new URL(req.url());
    const raw = req.postData();
    reqs.push({ path: u.pathname, search: u.search, headers: req.headers(), body: raw ? JSON.parse(raw) : null });
    r.fulfill({ status: 201, headers: cors(req), body: '' });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.evaluate(enableTracking);
  await page.waitForTimeout(500);

  const visits = reqs.filter(r => r.path === '/rest/v1/visits');
  const beats = reqs.filter(r => r.path === '/rest/v1/rpc/touch_heartbeat');
  check('visit sent once on load', visits.length === 1, `count=${visits.length}`);
  check('heartbeat sent once on load', beats.length === 1, `count=${beats.length}`);
  check('heartbeat calls touch_heartbeat RPC (no direct table write)', beats.length === 1 && beats[0].search === '');
  check('requests carry the key in apikey header only', visits.length === 1 && visits[0].headers['apikey'] === 'test-anon-key' && !visits[0].headers['authorization']);
  check('visit payload has only allowed keys', visits.length === 1 && Object.keys(visits[0].body).sort().join() === [...ALLOWED_VISIT_KEYS].sort().join(), visits.length ? Object.keys(visits[0].body).join() : '');
  check('heartbeat payload has only allowed keys', beats.length === 1 && Object.keys(beats[0].body).sort().join() === [...ALLOWED_BEAT_KEYS].sort().join(), beats.length ? Object.keys(beats[0].body).join() : '');
  const sampleEn = await page.evaluate(() => dayItems[0].en);
  check('no learning text in any payload', !JSON.stringify(reqs.map(r => r.body)).includes(sampleEn));
  check('no horizontal overflow at 360px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // 3. 같은 탭에서 새로고침: 방문은 추가되지 않고 ID는 유지
  const vidBefore = await page.evaluate(() => trackVid);
  const sidBefore = await page.evaluate(() => trackSessionId);
  reqs.length = 0;
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => dayItems.length > 0);
  await page.evaluate(enableTracking);
  await page.waitForTimeout(300);
  check('reload in same tab adds no visit', reqs.filter(r => r.path === '/rest/v1/visits').length === 0);
  check('visitor id kept across reload', (await page.evaluate(() => trackVid)) === vidBefore);
  check('session id kept across reload', (await page.evaluate(() => trackSessionId)) === sidBefore);

  // 4. 탭이 숨겨지면 하트비트 중단, 다시 보이면 재개
  reqs.length = 0;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    sendHeartbeat();
  });
  await page.waitForTimeout(200);
  check('no heartbeat while tab hidden', reqs.length === 0, `count=${reqs.length}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    sendHeartbeat();
  });
  await page.waitForTimeout(200);
  check('heartbeat resumes when visible', reqs.filter(r => r.path === '/rest/v1/rpc/touch_heartbeat').length === 1);

  // 5. 전송이 실패해도 앱은 오류 없이 동작
  await page.unroute(`${FAKE}/**`);
  await page.route(`${FAKE}/**`, r => r.abort());
  pageErrors.length = 0;
  await page.evaluate(() => sendHeartbeat());
  await page.waitForTimeout(300);
  check('failed send causes no page error', pageErrors.length === 0, pageErrors.join(' | '));
  await page.click('#setup-screen button[onclick="startStudy()"]');
  await page.waitForFunction(() => !document.getElementById('study-screen').classList.contains('hidden'));
  check('app still starts study after failed send', true);
  await context.close();

  console.log(results.join('\n'));
  await browser.close();
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
