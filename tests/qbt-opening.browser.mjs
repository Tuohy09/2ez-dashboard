import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
let torrents = {}, rid = 0, now = Date.UTC(2026, 8, 29), fail = false;
const torrent = (hash, state, progress = .4) => ({ hash, name: `Sample ${hash}`, state, progress, size: 1000, downloaded: 400, dlspeed: state === 'downloading' ? 100 : 0, upspeed: 0, category: '', tags: '' });
await page.clock.setFixedTime(now);
await page.addInitScript(() => { Math.random = () => 0; });
await page.route('**/qbt/api/v2/**', async route => {
  const endpoint = new URL(route.request().url()).pathname.split('/api/v2/')[1];
  if (route.request().method() !== 'GET') throw new Error('This headline test must never mutate qBittorrent.');
  if (fail) return route.fulfill({ status: 503, body: 'Connection unavailable' });
  if (endpoint === 'app/version') return route.fulfill({ body: 'v5.2.3' });
  const data = endpoint === 'sync/maindata' ? { full_update: true, rid: ++rid, torrents, categories: {}, tags: [], server_state: { connection_status: 'connected' } } : {};
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
async function refresh(next = torrents, increment = 2500) {
  torrents = next; now += increment; await page.clock.setFixedTime(now);
  await Promise.all([page.waitForResponse(response => response.url().includes('sync/maindata')), page.getByRole('button', { name: 'Refresh ↻', exact: true }).click()]);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const title = () => page.locator('.qb-intro h1').textContent();
try {
  await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.nav-item').filter({ hasText: 'qBittorrent' }).click();
  await page.getByRole('heading', { name: 'Hmm, bit quiet in here. Been busy, mate?', exact: true }).waitFor();
  await refresh({ a: torrent('a', 'queuedDL') }); assert.equal(await title(), '1 in the queue. Form an orderly download.');
  await refresh({ a: torrent('a', 'downloading'), b: torrent('b', 'queuedDL'), c: torrent('c', 'stalledDL') });
  assert.equal(await title(), 'One little download. As a treat.');
  assert.equal(await page.locator('.qb-opening-summary').textContent(), '1 downloading · 1 queued · 1 stalled');
  assert.equal(await page.locator('.qb-stats > div').nth(2).locator('strong').textContent(), '1');
  await refresh({ a: torrent('a', 'stalledDL') }); assert.equal(await title(), 'Waiting for the next bit.');
  for (let i = 0; i < 12; i++) await refresh();
  assert.equal(await title(), 'All queued up and no peer to go.');
  for (let i = 0; i < 18; i++) await refresh();
  assert.equal(await title(), 'A peer-reviewed study in going absolutely nowhere.');
  for (const width of [1920, 1440, 1024, 390, 320]) { await page.setViewportSize({ width, height: 1080 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Headline overflow at ${width}`); }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('searchbox', { name: 'Find a torrent', exact: true }).fill('no-match');
  assert.equal(await title(), 'A peer-reviewed study in going absolutely nowhere.', 'Headlines describe the whole queue, not search results');
  await page.getByRole('searchbox', { name: 'Find a torrent', exact: true }).fill('');
  await refresh({ a: torrent('a', 'uploading', 1) }); assert.equal(await title(), 'That’s landed. Go on, have a look.');
  for (let i = 0; i < 18; i++) await refresh();
  assert.equal(await title(), 'Nothing coming in. Just giving back, like a legend.');
  await refresh({ a: torrent('a', 'error') }); assert.equal(await title(), '1 transfer needs a hand. Check the errored transfers.');
  fail = true; await refresh(); assert.equal(await title(), 'Lost touch with qBittorrent. Trying again…');
  assert.ok((await page.locator('.qb-opening-summary').textContent()).startsWith('Last known counts'));
  assert.deepEqual(errors, []);
  console.log('Live headline counts, rotation, stall grace, completion expiry, search independence, connection errors and desktop/mobile sizing passed with mocked data.');
} finally { await browser.close(); }
