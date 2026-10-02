import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
const errors = [], writes = []; page.on('pageerror', error => errors.push(error.message));
const id = n => n.toString(16).repeat(64), iid = n => `sha256:${id(n)}`;
let containers = ['jellyfin', 'navidrome', 'unmanic', 'qbittorrent', 'gluetun', 'uptime-kuma'].map((name, i) => ({ id: id(i + 1), name, image: ['jellyfin/jellyfin:10.10.7', 'deluan/navidrome:latest', 'josh5/unmanic:latest', 'linuxserver/qbittorrent:latest', 'qmcgaw/gluetun:latest', 'louislam/uptime-kuma:1'][i], image_id: iid(i + 1), stack: i < 3 ? 'media' : i < 5 ? 'downloads' : 'tools', state: i === 5 ? 'exited' : 'running', status: i === 5 ? 'Exited (0) 2 days ago' : 'Up 3 days', cpu_percent: [2.8, .4, 12.6, 1.2, .3, 0][i], memory_usage: [614, 186, 428, 246, 64, 0][i] * 1048576 }));
let images = containers.map((container, i) => ({ id: iid(i + 1), tags: [container.image], digests: [], size: (i + 1) * 200e6, created: 1790500000, containers: [{ id: container.id, name: container.name, state: container.state }] })).concat([{ id: iid(7), tags: ['alpine:3.20'], digests: [], size: 7800000, created: 1790500000, containers: [] }]);
let jobs = [], fail = false, content = 'services:\n  jellyfin:\n    image: jellyfin/jellyfin:10.10.7\n', revision = 'one';
const stack = name => ({ name, files: [`/opt/stacks/${name}/compose.yaml`], containers: containers.filter(c => c.stack === name), running: containers.filter(c => c.stack === name && c.state === 'running').length, total: containers.filter(c => c.stack === name).length, manageable: name !== 'tools', reason: name === 'tools' ? 'This project is outside /opt/stacks.' : '', status: name === 'tools' ? 'stopped' : 'running', content, revision });
async function json(route, data, status = 200) { return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) }); }
await page.route('**/sys-api/docker/**', async route => {
  const req = route.request(), path = new URL(req.url()).pathname;
  assert.equal(req.method(), 'GET', 'Legacy controls must not be used');
  if (fail) return json(route, { error: 'Docker unavailable' }, 503);
  if (path.endsWith('/containers')) return json(route, containers);
  if (path.endsWith('/logs')) return json(route, { logs: 'Service ready\n<img src=x onerror=alert(1)>\nHealth check passed' });
  return json(route, { restartPolicy: 'unless-stopped', created: '2026-09-29T12:00:00Z', ports: ['0.0.0.0:8096 → 8096/tcp'], volumes: [{ dest: '/media', source: '/library', mode: 'ro' }], networks: [{ name: 'media_default', ip: '172.20.0.2' }], env: ['EXAMPLE=sample'], command: '/jellyfin' });
});
await page.route('**/docker-api/**', async route => {
  const req = route.request(), path = decodeURIComponent(new URL(req.url()).pathname.replace('/docker-api', '')), method = req.method(), data = method === 'GET' ? {} : JSON.parse(req.postData() || '{}');
  if (fail) return json(route, { error: 'Docker unavailable' }, 503);
  if (method !== 'GET') writes.push({ path, method, data });
  if (path === '/images' && method === 'GET') return json(route, images);
  if (path === '/jobs') return json(route, jobs.map(job => ({ ...job, status: 'succeeded', output: 'Pull complete' })));
  if (path === '/images/pull') { jobs = [{ id: 'pull-job', reference: data.reference, status: 'running', output: 'Downloading layers' }]; return json(route, jobs[0], 202); }
  if (method === 'DELETE') { const imageId = path.slice('/images/'.length); images = images.filter(image => image.id !== imageId); return json(route, {}); }
  if (path.startsWith('/containers/')) { const [, , containerId, action] = path.split('/'); containers = containers.filter(c => action !== 'remove' || c.id !== containerId).map(c => c.id !== containerId ? c : { ...c, state: action === 'stop' ? 'exited' : action === 'pause' ? 'paused' : 'running' }); return json(route, { ok: true }); }
  return json(route, { architecture: 'amd64', os: 'linux', layers: 8 });
});
await page.route('**/stack-api/**', async route => {
  const req = route.request(), path = decodeURIComponent(new URL(req.url()).pathname.replace('/stack-api', '')), method = req.method(), data = method === 'GET' ? {} : JSON.parse(req.postData() || '{}');
  if (method !== 'GET') writes.push({ path, method, data });
  if (path === '/stacks') return json(route, method === 'POST' ? { name: data.name } : { root: '/opt/stacks', composeVersion: 'v2.39.0', stacks: ['media', 'downloads', 'tools'].map(stack) });
  if (path.endsWith('/validate')) return json(route, { output: 'valid' });
  if (method === 'PUT') { content = data.content; revision = 'two'; return json(route, { revision, backup: 'compose.yaml.backup' }); }
  if (path.endsWith('/logs')) return json(route, { output: 'Stack service ready' });
  if (path.endsWith('/actions')) return json(route, { id: 'stack-job', action: data.action, status: 'succeeded', output: 'Done', startedAt: Date.now() });
  return json(route, stack(path.split('/')[2]));
});
const button = name => page.getByRole('button', { name, exact: true });
const tab = name => page.locator('.dm-resource-tabs').getByRole('button', { name: new RegExp(`^${name}`) });
const inspector = () => page.getByRole('complementary', { name: 'Selected container' });
try {
  await page.goto(process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173');
  await page.locator('.nav-item').filter({ hasText: /^Docker$/ }).click(); await button('jellyfin').waitFor();
  assert.equal(await page.getByText('Stack Manager', { exact: true }).count(), 0);
  await page.locator('.nav-footer').getByRole('button', { name: 'Dark', exact: true }).click();
  await inspector().getByText('unless-stopped', { exact: true }).waitFor(); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: resolve('artifacts/docker-manager-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Logs', exact: true }).click(); await page.getByText('Health check passed', { exact: false }).waitFor(); assert.equal(await page.locator('.dm-log img').count(), 0);
  await inspector().getByRole('button', { name: 'Stop', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(writes.length, 0);
  await inspector().getByRole('button', { name: 'Restart', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'restart completed' }).waitFor(); assert.equal(writes.at(-1).path, `/containers/${id(1)}/restart`);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click(); await button('Inspect image & usage ↗').click(); await page.getByRole('complementary', { name: 'Selected image' }).waitFor(); assert.ok(await button('Remove image').isDisabled());
  await page.getByRole('complementary', { name: 'Selected image' }).getByRole('button', { name: /jellyfin ↗/ }).click(); await inspector().waitFor();
  await page.getByRole('tab', { name: 'Compose', exact: true }).click(); await button('Open Compose editor →').click(); await page.getByRole('textbox', { name: 'Compose configuration', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Compose configuration', exact: true }).fill(content + '    restart: unless-stopped\n');
  page.once('dialog', dialog => dialog.dismiss()); await tab('Images').click(); assert.ok(await page.getByRole('textbox', { name: 'Compose configuration', exact: true }).isVisible());
  await button('Validate').click(); await page.getByRole('status').filter({ hasText: 'configuration is valid' }).waitFor();
  await button('Save Compose').click(); await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor(); assert.equal(writes.at(-1).method, 'PUT');
  await tab('Images').click(); await button('alpine:3.20').click(); await button('Remove image').click(); await page.getByRole('dialog').getByRole('button', { name: 'Remove images', exact: true }).click(); await page.getByRole('status').filter({ hasText: '1 images removed' }).waitFor(); assert.equal(writes.at(-1).path, `/images/${iid(7)}`);
  await button('↓ Pull image').click(); await page.getByRole('textbox', { name: 'Image reference' }).fill('alpine:3.21'); await page.getByRole('dialog').getByRole('button', { name: 'Pull image', exact: true }).click(); await page.locator('.dm-job summary').filter({ hasText: 'succeeded' }).waitFor(); assert.deepEqual(writes.at(-1).data, { reference: 'alpine:3.21' });
  await button('+ New stack').click(); await page.getByRole('textbox', { name: 'Stack name' }).fill('sample');
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('.nav-item').filter({ hasText: /^Home$/ }).click(); assert.ok(await page.getByRole('textbox', { name: 'Stack name' }).isVisible());
  page.once('dialog', dialog => dialog.accept()); await tab('Containers').click(); await button('jellyfin').waitFor();
  for (const theme of ['Light', 'Dark', 'OLED']) { await page.locator('.nav-footer').getByRole('button', { name: theme, exact: true }).click(); for (const resource of ['Containers', 'Images', 'Stacks']) { await tab(resource).click(); for (const width of [1920, 1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 1080 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${resource} overflow ${width}`); } await page.setViewportSize({ width: 1920, height: 1080 }); } }
  await tab('Containers').click(); await page.getByRole('searchbox', { name: 'Search containers' }).fill('nothing-matches'); await page.getByText('No items match these filters.', { exact: true }).waitFor(); await page.getByRole('searchbox', { name: 'Search containers' }).fill('');
  for (let i = 0; i < 30; i++) containers.push({ ...containers[0], id: `sample-${i}`, name: `sample-${i}` }); await button('Refresh ↻').click(); await button('Next').waitFor(); await button('Next').click(); await page.getByText('2 / 2', { exact: true }).waitFor();
  fail = true; await button('Refresh ↻').click(); await page.getByRole('alert').filter({ hasText: 'containers: Docker unavailable' }).waitFor(); assert.ok(await inspector().getByRole('button', { name: 'Restart', exact: true }).isDisabled());
  fail = false; await page.getByRole('button', { name: 'Retry', exact: true }).first().click(); await page.getByRole('alert').filter({ hasText: 'containers: Docker unavailable' }).waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: resolve('artifacts/docker-manager-mobile.png') });
  assert.deepEqual(errors, []); console.log('Docker manager browser checks passed: containers, image references, removal, pull jobs, Compose validation/save, dirty navigation, search/pagination, all themes and mobile. All writes mocked.');
} finally { await browser.close(); }
