import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1680, height: 1120 }, reducedMotion: 'reduce' });
const origin = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173';
const errors = []; page.on('pageerror', error => errors.push(error.message));
const { demoListing } = await import('../src/files/demo.js');
let signedIn = false, failure = 0, waitForListing = false, failRight = false;
await page.route('**/sys-api/**', route => route.fulfill({ json: [] }));
await page.route('**/qbt/**', route => route.fulfill({ json: {} }));
await page.route('**/um-api/**', route => route.fulfill({ json: {} }));
await page.route('https://**', route => route.abort());
await page.route('**/files-api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/session')) {
    if (route.request().method() === 'POST') { signedIn = true; return route.fulfill({ json: { username: 'tuohy' } }); }
    if (route.request().method() === 'DELETE') { signedIn = false; return route.fulfill({ json: { success: true } }); }
    return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { username: 'tuohy' } : { error: 'Sign in to File Browser.' } });
  }
  if (failRight && url.searchParams.get('path') === '/Documents') return route.fulfill({ status: 403, json: { error: 'Access denied. Open a different folder.' } });
  if (failure) return route.fulfill({ status: failure, json: { error: failure === 403 ? 'Your File Browser account cannot access this folder. Choose another folder or ask the administrator for access.' : failure === 401 ? 'Your session expired. Sign in again.' : 'Cannot reach File Browser. Check the service connection and try again.' } });
  if (waitForListing) await new Promise(resolve => setTimeout(resolve, 700));
  if (url.pathname.endsWith('/resources')) {
    const listing = demoListing(url.searchParams.get('path'));
    if (listing.path === '/Documents') listing.items = [...listing.items, { name: '.hidden.txt', path: '/Documents/.hidden.txt', size: 1024, modified: '2026-10-03' }];
    return route.fulfill({ json: listing });
  }
  if (url.pathname.endsWith('/text')) return route.fulfill({ json: { text: '<script>window.previewInjected = true</script>\nSafe text preview', truncated: false } });
  return route.fulfill({ body: 'sample file', contentType: 'application/octet-stream' });
});
const button = name => page.getByRole('button', { name, exact: true });
const browseFolder = async name => { await page.getByRole('button', { name: `Open folder ${name}`, exact: true }).first().click(); await page.getByRole('heading', { name: new RegExp(`^${name}`) }).waitFor(); };
try {
  await page.goto(`${origin}/#files`);
  await button('Sign in to File Browser').waitFor();
  await page.getByLabel('Username', { exact: true }).fill('tuohy'); await page.getByLabel('Password', { exact: true }).fill('correct'); await button('Sign in to File Browser').click();
  await page.getByRole('heading', { name: /^All files/ }).waitFor();
  waitForListing = true; await page.getByRole('button', { name: 'Open folder Music', exact: true }).click(); await page.getByRole('status', { name: 'Loading files' }).waitFor(); await page.getByRole('heading', { name: /^Music/ }).waitFor(); await page.getByRole('button', { name: 'Open folder Tycho', exact: true }).waitFor(); waitForListing = false; await browseFolder('Tycho'); await browseFolder('Awake');
  await page.getByRole('button', { name: 'Inspect file 01 - Awake.flac', exact: true }).click();
  await page.getByRole('complementary', { name: 'File details' }).waitFor();
  assert.match(await page.getByRole('link', { name: 'Download', exact: true }).getAttribute('href'), /files-api\/raw\?path=/);
  await page.getByRole('searchbox', { name: 'Find in this folder', exact: true }).fill('Montana'); assert.equal(await page.locator('.fb-row').count(), 1);
  await page.getByRole('searchbox', { name: 'Find in this folder', exact: true }).fill('no such file'); await page.getByRole('heading', { name: 'No matching files' }).waitFor(); await button('Clear search').click(); assert.equal(await page.locator('.fb-row').count(), 10);
  await page.getByLabel('Sort files', { exact: true }).selectOption('size'); assert.match(await page.locator('.fb-row').first().innerText(), /01 - Awake/);
  await button('Pin current folder').click(); assert.equal(await button('Unpin current folder').count(), 1);
  await page.getByRole('button', { name: 'Inspect file album.nfo', exact: true }).click(); await page.getByText('Safe text preview', { exact: false }).waitFor(); assert.equal(await page.evaluate(() => window.previewInjected), undefined);
  for (const view of ['Gallery', 'Columns', 'Compact', 'Split view', 'Explorer']) {
    await button(view).click(); await page.getByRole('heading', { name: /^Awake/ }).waitFor();
    assert.equal(await button(view).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('complementary', { name: 'File details' }).count(), 1);
  }
  await button('Split view').click(); await page.locator('.fb-second').getByRole('button', { name: 'Open folder Documents', exact: true }).click(); await page.locator('.fb-second').getByRole('heading', { name: 'Documents', exact: true }).waitFor(); assert.match(await page.locator('.fb-main h2').innerText(), /Awake/);
  failRight = true; await button('Refresh folder').click(); await page.getByText('Right folder could not be opened', { exact: true }).waitFor(); assert.equal(await page.locator('.fb-main .fb-row').count(), 10); failRight = false; await button('Retry right folder').click(); await page.locator('.fb-second').getByRole('button', { name: 'Inspect file backup-plan.md', exact: true }).waitFor();
  await button('Explorer').click(); await page.locator('.fb-locations').getByRole('button', { name: 'Documents', exact: true }).click(); await page.getByRole('heading', { name: /^Documents/ }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Inspect file .hidden.txt', exact: true }).count(), 0); await page.getByLabel('Hidden files', { exact: true }).check(); assert.equal(await page.getByRole('button', { name: 'Inspect file .hidden.txt', exact: true }).count(), 1);
  await page.locator('.fb-locations').getByRole('button', { name: 'Downloads', exact: true }).click(); await page.getByRole('heading', { name: 'This folder is empty' }).waitFor();
  failure = 403; await button('Refresh folder').click(); await page.getByRole('heading', { name: 'This folder is empty' }).waitFor({ state: 'hidden' }); await page.getByText('Access to this folder is restricted', { exact: true }).waitFor();
  failure = 502; await button('Try again').click(); await page.getByText('This folder could not be opened', { exact: true }).waitFor();
  failure = 0; await button('Try again').click(); await page.getByRole('heading', { name: 'This folder is empty' }).waitFor();
  failure = 401; await button('Refresh folder').click(); await button('Sign in to File Browser').waitFor(); failure = 0;
  await button('Explore the five views with sample files').click(); await page.getByRole('heading', { name: /^Awake/ }).waitFor(); await page.getByText('Sample files', { exact: true }).waitFor();
  for (const theme of ['Light', 'Dark', 'OLED']) {
    await page.setViewportSize({ width: 1680, height: 1120 }); await page.locator('.nav-sidebar').getByRole('button', { name: theme, exact: true }).click();
    for (const view of ['Explorer', 'Gallery', 'Columns', 'Compact', 'Split view']) {
      await button(view).click();
      for (const width of [1680, 1024, 768, 600, 390, 320]) {
        await page.setViewportSize({ width, height: 1120 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${view} overflow at ${width}`);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await button('Explorer').click(); await page.getByRole('button', { name: 'Inspect file cover.jpg', exact: true }).click(); await page.getByRole('img', { name: 'Sample album artwork' }).waitFor(); assert.ok(await page.evaluate(() => scrollY > 0), 'Mobile selection brings preview into view');
  await button('Close file details').click(); assert.equal(await page.getByRole('img', { name: 'Sample album artwork' }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('File browser: sign-in, native navigation, folders, search, sorting, hidden files, pins, safe text preview, download links, five layouts, independent split folders, empty/error/denied/expired-session states, mobile selection, and 90 theme/viewport combinations passed.');
} finally { await browser.close(); }
