import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let queue = [{ id: 7, abspath: '/library/movies/Big Buck Bunny.mkv', priority: 12, status: 'in_progress', type: 'local', library_id: 1, library_name: 'Movies' }, { id: 8, abspath: '/library/movies/Sintel.mkv', priority: 10, status: 'pending', type: 'local', library_id: 1, library_name: 'Movies' }];
let history = [{ id: 101, task_label: 'Elephants Dream.mkv', task_success: true, start_time: 1790500000, finish_time: 1790500480 }, { id: 102, task_label: 'Tears of Steel.mkv', task_success: false, start_time: 1790501000, finish_time: 1790501120 }];
let workers = [{ id: 'local-0', name: 'Worker 1', paused: false, idle: false, start_time: '1790500000', current_task: 7, current_file: 'Big Buck Bunny.mkv', current_command: 'ffmpeg -i input.mkv output.mkv', worker_log_tail: ['frame=100 speed=1.8x', 'frame=200 speed=2.4x'], subprocess: { percent: '62.8', elapsed: 128, cpu_percent: '42.1', rss_bytes: '256000000' }, runners_info: { encode: { name: 'Video encoder', status: 'running', success: false } } }, { id: 'local-1', name: 'Worker 2', paused: true, idle: true, current_file: '', worker_log_tail: [], subprocess: {} }];
let scan = { state: 'idle', can_rescan: true, can_pause: false, can_resume: false, can_cancel: false };
let fail = false; const writes = [];
await page.route('**/um-api/**', async route => {
  const req = route.request(), endpoint = new URL(req.url()).pathname.split('/um-api/')[1];
  const data = req.method() === 'GET' ? {} : JSON.parse(req.postData() || '{}');
  if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unmanic is unavailable.' }) });
  let result = {};
  if (endpoint === 'pending/tasks' && req.method() === 'POST') {
    const items = queue.filter(item => item.abspath.toLowerCase().includes((data.search_value || '').toLowerCase()) && (!data.library_ids?.length || data.library_ids.includes(item.library_id)));
    result = { results: items.slice(data.start || 0, (data.start || 0) + (data.length || 25)), recordsTotal: queue.length, recordsFiltered: items.length };
  } else if (endpoint === 'history/tasks' && req.method() === 'POST') {
    const items = history.filter(item => item.task_label.toLowerCase().includes((data.search_value || '').toLowerCase()) && (!data.status || data.status === 'all' || (data.status === 'success') === item.task_success));
    result = { results: items.slice(data.start || 0, (data.start || 0) + (data.length || 25)), recordsTotal: history.length, recordsFiltered: items.length, successCount: history.filter(item => item.task_success).length, failedCount: history.filter(item => !item.task_success).length };
  } else if (endpoint === 'workers/status') result = { workers_status: workers };
  else if (endpoint === 'pending/rescan/status') result = scan;
  else if (endpoint === 'version/read') result = { version: '0.4.1' };
  else if (endpoint === 'settings/libraries') result = { libraries: [{ id: 1, name: 'Movies', path: '/library/movies', enable_scanner: true, enable_inotify: true }, { id: 2, name: 'TV', path: '/library/tv', enable_scanner: false, enable_inotify: true }] };
  else if (endpoint === 'history/task/log') result = { command_log_lines: ['<b>Video encoder</b>', '<img src=x onerror=alert(1)>', 'Encoding complete.'] };
  else {
    writes.push({ endpoint, method: req.method(), data });
    if (endpoint.includes('workers/worker/pause')) workers = workers.map(w => !data.worker_id || w.id === data.worker_id ? { ...w, paused: true } : w);
    if (endpoint.includes('workers/worker/resume')) workers = workers.map(w => !data.worker_id || w.id === data.worker_id ? { ...w, paused: false } : w);
    if (endpoint === 'pending/rescan' && req.method() === 'POST') scan = { state: 'scanning', can_rescan: false, can_pause: true, can_resume: false, can_cancel: true };
    if (endpoint === 'pending/rescan/pause') scan = { ...scan, state: 'paused', can_pause: false, can_resume: true };
    if (endpoint === 'pending/rescan/resume') scan = { ...scan, state: 'scanning', can_pause: true, can_resume: false };
    if (endpoint === 'pending/tasks' && req.method() === 'DELETE') queue = queue.filter(item => !data.id_list.includes(item.id));
    if (endpoint === 'history/tasks' && req.method() === 'DELETE') history = history.filter(item => !data.id_list.includes(item.id));
    result = { success: true };
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
});
const button = name => page.getByRole('button', { name, exact: true });
const nav = name => page.locator('.um-sections').getByRole('button', { name, exact: true });
const refresh = () => button('Refresh ↻').click();
try {
  await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.nav-item').filter({ hasText: /^Unmanic$/ }).click();
  await button('Big Buck Bunny.mkv').waitFor();
  await page.locator('.nav-footer').getByRole('button', { name: 'Dark', exact: true }).click();
  await button('Big Buck Bunny.mkv').click();
  await page.getByRole('region', { name: 'Selected Unmanic item' }).waitFor();
  await page.getByRole('tab', { name: 'Logs', exact: true }).click(); await page.getByText('frame=100 speed=1.8x', { exact: false }).waitFor();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('artifacts/2ez-unmanic-desktop.png'), fullPage: true });
  await button('Pause worker').click(); await button('Resume worker').waitFor();
  assert.deepEqual(writes.at(-1), { endpoint: 'workers/worker/pause', method: 'POST', data: { worker_id: 'local-0' } });
  await button('Resume worker').click(); await button('Pause worker').waitFor();
  await button('Stop current job').click(); await page.getByRole('dialog').waitFor(); assert.ok((await page.getByRole('dialog').textContent()).includes('work in progress may be lost')); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await button('Processing desk').click(); await page.getByRole('dialog', { name: 'Selected Unmanic item' }).waitFor(); await page.keyboard.press('Escape');
  await button('Status board').click(); await button('Big Buck Bunny.mkv').click(); assert.ok(await page.locator('.um-card.expanded .um-detail').isVisible());
  await button('Big Buck Bunny.mkv').click(); assert.equal(await page.locator('.um-detail').count(), 0);
  await button('Big Buck Bunny.mkv').click(); await page.locator('.um-group-toggle').filter({ hasText: 'Processing' }).click(); assert.equal(await page.locator('.um-detail').isVisible(), false);
  await page.locator('.um-group-toggle').filter({ hasText: 'Processing' }).click(); assert.ok(await page.locator('.um-card.expanded .um-detail').isVisible());
  await page.getByRole('checkbox', { name: 'Select Sintel.mkv', exact: true }).check(); await page.locator('.qb-bulk').getByRole('button', { name: 'Move to top', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Queue order updated.' }).waitFor(); assert.deepEqual(writes.at(-1).data, { id_list: [8], position: 'top' });
  await button('Remove from queue').click(); const removal = page.getByRole('dialog'); assert.ok((await removal.textContent()).includes('Local source files are kept')); await removal.getByRole('button', { name: 'Remove queued jobs', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'queue entries removed' }).waitFor(); assert.deepEqual(writes.at(-1), { endpoint: 'pending/tasks', method: 'DELETE', data: { id_list: [8] } });
  await button('+ Add file').click(); await page.getByLabel('File path', { exact: true }).fill('/library/movies/new.mkv'); await page.getByRole('dialog').getByLabel('Library', { exact: true }).selectOption('2'); await page.getByRole('dialog').getByRole('button', { name: 'Add a file', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'File queued.' }).waitFor(); assert.deepEqual(writes.at(-1).data, { path: '/library/movies/new.mkv', library_id: 2 });
  await button('Scan libraries').click(); await page.getByRole('dialog').getByRole('button', { name: 'Scan libraries', exact: true }).click(); await button('Pause scan').waitFor(); await button('Pause scan').click(); await button('Resume scan').waitFor();
  await nav('History').click(); await button('Elephants Dream.mkv').click(); await page.getByRole('tab', { name: 'Logs', exact: true }).click(); await page.getByText('Encoding complete.', { exact: false }).waitFor(); assert.equal(await page.locator('.um-log img').count(), 0, 'Log HTML is rendered as text');
  await page.getByRole('combobox', { name: 'Filter result', exact: true }).selectOption('failed'); await button('Tears of Steel.mkv').waitFor(); assert.equal(await button('Elephants Dream.mkv').count(), 0);
  await page.getByRole('checkbox', { name: 'Select Tears of Steel.mkv', exact: true }).check(); await button('Reprocess').click(); await page.getByRole('dialog').getByRole('button', { name: 'Reprocess files', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'files queued' }).waitFor(); assert.deepEqual(writes.at(-1).data, { library_id: 1, id_list: [102] });
  await nav('Libraries').click(); await button('Movies').click(); await page.getByRole('region', { name: 'Selected Unmanic item' }).waitFor(); assert.ok((await page.locator('.um-detail').textContent()).includes('/library/movies'));
  await nav('Workers').click(); await button('Worker 1').waitFor();
  for (const mode of ['Light', 'Dark', 'OLED']) {
    await page.locator('.nav-footer').getByRole('button', { name: mode, exact: true }).click();
    for (const layout of ['Processing desk', 'Split workspace', 'Status board']) {
      await button(layout).click(); if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
      for (const width of [1920, 1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1080 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${mode} ${layout} overflow ${width}`); }
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
  }
  await button('Status board').click(); await page.reload(); await page.locator('.nav-item').filter({ hasText: /^Unmanic$/ }).click(); assert.equal(await button('Status board').getAttribute('aria-pressed'), 'true');
  await button('Big Buck Bunny.mkv').waitFor(); await page.setViewportSize({ width: 390, height: 844 }); await button('Big Buck Bunny.mkv').click(); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: resolve('artifacts/2ez-unmanic-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (let i = 0; i < 30; i++) queue.push({ ...queue[0], id: 1000 + i, abspath: `/library/movies/Sample-${i}.mkv`, status: 'pending' });
  await refresh(); await button('Next').waitFor(); await button('Next').click(); await page.getByText('2 / 2', { exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Search Unmanic items', exact: true }).fill('not-present'); await page.getByText('No items match these filters.', { exact: true }).waitFor();
  await page.getByRole('searchbox', { name: 'Search Unmanic items', exact: true }).fill('');
  fail = true; await refresh(); await page.getByRole('alert').filter({ hasText: 'Unmanic is unavailable.' }).first().waitFor(); assert.equal(await button('+ Add file').isDisabled(), true);
  fail = false; queue = []; await button('Retry').click(); await page.getByText('The queue is clear. Add a file or scan your libraries.', { exact: true }).waitFor();
  await page.locator('.nav-item').filter({ hasText: 'Downloads & Transcodes' }).click(); await page.locator('a[data-sort-id="unmanic"]').click(); await page.locator('.um-page').waitFor(); assert.equal(page.context().pages().length, 1, 'Existing widget opens native page');
  assert.deepEqual(errors, []); console.log('Unmanic layouts, controls, confirmations, selection targeting, logs, filters, pagination, errors, themes, mobile and native navigation passed. All writes mocked.');
} finally { await browser.close(); }
