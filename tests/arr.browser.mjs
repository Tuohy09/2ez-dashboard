import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1680, height: 1120 }, reducedMotion: 'reduce' });
const origin = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:3180';
const errors = []; page.on('pageerror', error => errors.push(error.message));
await page.route('https://**', route => route.abort());
for (const prefix of ['sys-api', 'qbt', 'um-api']) await page.route(`**/${prefix}/**`, route => route.fulfill({ json: prefix === 'sys-api' ? [] : {} }));
const date = new Date(); date.setHours(12, 0, 0, 0);
const dateISO = date.toISOString();
const titles = Object.fromEntries(['sonarr', 'radarr'].map(service => [service, Array.from({ length: 26 }, (_, index) => ({
  id: index + 1, tvdbId: 1000 + index, tmdbId: 2000 + index, title: index === 0 ? service === 'sonarr' ? 'Severance' : 'Arrival' : `Title ${String(index + 1).padStart(2, '0')}`,
  year: 2024, overview: 'A carefully chosen story for a quiet evening.', genres: ['Science Fiction', 'Drama'], monitored: true, hasFile: index !== 1,
  isAvailable: true, statistics: { episodeCount: 9, episodeFileCount: 7 }, seasons: [{ seasonNumber: 1, monitored: true }], quality: 'Bluray-1080p', path: '/media/title', added: dateISO,
}))]));
const episodes = Array.from({ length: 14 }, (_, index) => ({ id: 101 + index, seriesId: 1, title: `Episode ${index + 1}`, seasonNumber: 1, episodeNumber: index + 1, monitored: true, hasFile: index < 7, airDateUtc: dateISO }));
let failure = false, slow = false, releaseMode = 'normal'; const writes = [];
await page.route('**/arr-api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  const [, service, endpoint] = url.pathname.split('/arr-api/')[1].match(/^([^/]+)\/(.+)$/);
  const tv = service === 'sonarr';
  if (endpoint.startsWith('cover/')) return route.fulfill({ status: 404 });
  if (failure) return route.fulfill({ status: 403, json: { error: 'Service denied access. Check its API key in the dashboard server configuration.' } });
  let json;
  if (request.method() !== 'GET') {
    const data = request.postDataJSON(); writes.push({ service, endpoint, method: request.method(), data });
    assert.equal(request.headers()['x-2ez-arr'], '1');
    if (endpoint === 'releases') {
      if (releaseMode === 'slow') await new Promise(resolve => setTimeout(resolve, 700));
      if (releaseMode === 'error') return route.fulfill({ status: 502, json: { error: 'Indexer search failed. Retry the search.' } });
      json = { records: releaseMode === 'empty' ? [] : Array.from({ length: 29 }, (_, index) => ({ token: `release-${index}`, title: `${tv ? 'Severance.S01' : 'Arrival.2024'}.WEB.1080p.Release${index}`, quality: 'WEB-1080p', customFormatScore: index, size: (index + 1) * 1073741824, indexer: 'Example indexer', seeders: index * 10, leechers: 2, protocol: 'torrent', publishDate: dateISO, languages: ['English'], customFormats: ['Preferred group'], rejected: index % 3 === 1, rejections: index % 3 === 1 ? ['Quality is below the profile cutoff', '<img src=x onerror=window.arrInjected=true>'] : [], downloadAllowed: index !== 2 })), totalRecords: releaseMode === 'empty' ? 0 : 29, searchedAt: dateISO, expiresAt: new Date(Date.now() + (releaseMode === 'expired' ? -1 : 600000)).toISOString() };
    } else if (endpoint === 'grab') {
      if (releaseMode === 'grabError') return route.fulfill({ status: 409, json: { error: 'Release no longer cached. Search again before downloading.' } });
      json = { success: true };
    } else if (endpoint === 'monitor') {
      for (const item of data.kind === 'episodes' ? episodes : titles[service]) if (data.ids.includes(item.id)) item.monitored = data.monitored;
      json = { success: true };
    } else if (endpoint === 'search') json = { id: 999, status: 'queued' };
    else if (endpoint === 'add') { json = { ...titles[service][0], id: 40, title: 'New title', [tv ? 'tvdbId' : 'tmdbId']: data.externalId }; titles[service].unshift(json); }
    else throw new Error(`Unexpected mutation: ${endpoint}`);
  } else if (endpoint === 'summary') json = { total: titles[service].length, monitored: titles[service].filter(item => item.monitored).length, collected: 20, queue: 1, missing: 2, version: '6.0', updated: dateISO, health: [{ type: 'warning', message: 'Indexer unavailable. Open service settings to review.' }] };
  else if (endpoint === 'library') {
    if (slow) await new Promise(resolve => setTimeout(resolve, 800));
    let items = titles[service].filter(item => item.title.toLowerCase().includes((url.searchParams.get('query') || '').toLowerCase()));
    const filter = url.searchParams.get('filter');
    if (filter === 'unmonitored') items = items.filter(item => !item.monitored);
    if (filter === 'monitored') items = items.filter(item => item.monitored);
    if (filter === 'missing') items = items.filter(item => item.monitored && (tv ? item.statistics.episodeFileCount < item.statistics.episodeCount : !item.hasFile));
    const number = Number(url.searchParams.get('page') || 1);
    json = { records: items.slice((number - 1) * 24, number * 24), totalRecords: items.length, page: number, pageSize: 24 };
  } else if (endpoint === 'episodes') json = episodes;
  else if (endpoint === 'queue') json = { records: [{ id: 1, title: 'A release', [tv ? 'series' : 'movie']: titles[service][0], ...(tv ? { episode: episodes[0] } : {}), size: 100, sizeleft: 40, quality: 'WEB-1080p', timeleft: '00:03:12', trackedDownloadStatus: 'warning', trackedDownloadState: 'importPending', downloadClient: 'qBittorrent', statusMessages: [{ title: 'Import needs attention', messages: ['<img src=x onerror=window.arrInjected=true>', 'Check destination permissions.'] }] }], totalRecords: 1, page: 1, pageSize: 24 };
  else if (endpoint === 'missing') json = { records: tv ? [{ ...episodes[8], series: titles[service][0] }] : [{ ...titles[service][1], hasFile: false }], totalRecords: 1, page: 1, pageSize: 24 };
  else if (endpoint === 'calendar') json = tv ? [{ ...episodes[0], series: titles[service][0] }] : [{ ...titles[service][0], inCinemas: dateISO, digitalRelease: dateISO }];
  else if (endpoint === 'options') json = { profiles: [{ id: 4, name: 'HD-1080p' }], folders: [{ id: 2, path: '/media', accessible: true }, { id: 3, path: '/unavailable', accessible: false }] };
  else if (endpoint === 'lookup') json = [{ id: 0, title: 'New title', year: 2026, overview: 'A new addition.', tvdbId: 8888, tmdbId: 9999, seriesType: 'standard' }, { ...titles[service][0], existingId: 1 }];
  else throw new Error(`Unexpected read: ${endpoint}`);
  await route.fulfill({ json });
});
const button = name => page.getByRole('button', { name, exact: true });
const section = name => page.locator('.arr-sections').getByRole('button', { name: new RegExp(`^${name}`) });
const titleButton = () => page.locator('[data-arr-title]').first();
async function noOverflow() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal page overflow'); }
try {
  for (const service of ['sonarr', 'radarr']) {
    const tv = service === 'sonarr', name = tv ? 'Sonarr' : 'Radarr';
    await page.goto(`${origin}/#${service}`); await page.getByRole('navigation', { name: `${name} sections`, exact: true }).waitFor(); await titleButton().waitFor(); assert.equal(await page.locator('.arr-library-item').count(), 24);
    await noOverflow();
    await button('Next').click(); await page.getByText('2 / 2', { exact: true }).waitFor(); assert.equal(await page.locator('.arr-library-item').count(), 2);
    await button('Previous').click(); await titleButton().click(); await page.locator('.arr-title-details').waitFor();
    await button('Stop monitoring').click(); await button('Monitor title').waitFor();
    assert.deepEqual(writes.at(-1).data, { kind: 'title', ids: [1], monitored: false });
    await button('Monitor title').click(); await button('Stop monitoring').waitFor();
    if (tv) {
      await page.locator('.arr-episode').first().waitFor(); assert.equal(await page.locator('.arr-episode').count(), 12);
      await button('Next episodes').click(); assert.equal(await page.locator('.arr-episode').count(), 2); await button('Previous episodes').click();
      await button('Stop monitoring S01 E01').click(); await button('Monitor S01 E01').waitFor(); assert.deepEqual(writes.at(-1).data, { kind: 'episodes', ids: [101], monitored: false });
      await button('Automatic search S01 E01').click(); assert.equal(writes.at(-1).endpoint, 'monitor'); await button('Cancel').click();
      await button('Automatic search S01 E01').click(); await button('Start automatic search').click(); await page.getByRole('status').filter({ hasText: 'Search queued.' }).waitFor(); assert.deepEqual(writes.at(-1).data, { kind: 'episodes', ids: [101] });
    }
    await button(tv ? 'Automatic search series' : 'Automatic search movie').click(); await button('Start automatic search').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.deepEqual(writes.at(-1).data, { kind: 'title', ids: [1] });
    if (tv) {
      await button('Automatic season search').click(); await button('Start automatic search').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.deepEqual(writes.at(-1).data, { kind: 'season', ids: [1], seasonNumber: 1 });
      await button('Interactive search S01 E01').click(); await page.locator('.arr-release-result').first().waitFor(); assert.deepEqual(writes.at(-1).data, { kind: 'episodes', id: 101 }); await button('Done').click();
    }
    releaseMode = 'slow'; await button('Interactive search').click(); await page.getByRole('status').filter({ hasText: 'Searching configured indexers' }).waitFor(); await page.locator('.arr-release-result').first().waitFor(); releaseMode = 'normal';
    assert.deepEqual(writes.at(-1).data, tv ? { kind: 'season', id: 1, seasonNumber: 1 } : { kind: 'title', id: 1 });
    assert.equal(await page.locator('.arr-release-result').count(), 25); await button('Next releases').click(); assert.equal(await page.locator('.arr-release-result').count(), 4); await button('Previous releases').click();
    const releaseRow = index => page.locator('.arr-release-result').filter({ has: page.getByText(`${tv ? 'Severance.S01' : 'Arrival.2024'}.WEB.1080p.Release${index}`, { exact: true }) });
    const grabCount = writes.filter(write => write.endpoint === 'grab').length;
    await releaseRow(0).getByRole('button', { name: 'Download', exact: true }).click(); assert.equal(writes.filter(write => write.endpoint === 'grab').length, grabCount); await button('Cancel download').click();
    await releaseRow(0).getByRole('button', { name: 'Download', exact: true }).click(); await button('Download release').click(); await page.getByRole('status').filter({ hasText: 'Release sent to the download client.' }).waitFor(); assert.deepEqual(writes.at(-1).data, { token: 'release-0' }); assert.equal(await releaseRow(0).getByRole('button', { name: 'Sent', exact: true }).isDisabled(), true);
    assert.equal(await releaseRow(2).getByRole('button', { name: 'Unavailable', exact: true }).isDisabled(), true);
    await releaseRow(1).getByRole('button', { name: 'Download', exact: true }).click(); await page.getByText('Downloading it manually bypasses those automatic selection rules.', { exact: true }).waitFor(); await button('Download anyway').click(); await releaseRow(1).getByRole('button', { name: 'Sent', exact: true }).waitFor(); assert.deepEqual(writes.at(-1).data, { token: 'release-1' }); assert.equal(await page.evaluate(() => window.arrInjected), undefined);
    await page.getByLabel('Sort releases', { exact: true }).selectOption('peers'); assert.match(await page.locator('.arr-release-result').first().innerText(), /Release28/);
    await page.getByLabel('Filter release decisions', { exact: true }).selectOption('eligible'); assert.equal(await page.locator('.arr-release-result').count(), 19);
    await page.getByRole('searchbox', { name: 'Filter release titles', exact: true }).fill('not-present'); await page.getByText('No releases match these filters.', { exact: true }).waitFor(); await page.getByRole('searchbox', { name: 'Filter release titles', exact: true }).fill(''); await page.getByLabel('Filter release decisions', { exact: true }).selectOption('all');
    releaseMode = 'empty'; await button('Search again').click(); await page.getByText('No releases found.', { exact: true }).waitFor();
    releaseMode = 'error'; await button('Search again').click(); await page.getByRole('alert').filter({ hasText: 'Indexer search failed.' }).waitFor(); releaseMode = 'normal'; await button('Retry search').click(); await page.locator('.arr-release-result').first().waitFor();
    releaseMode = 'expired'; await button('Search again').click(); await page.getByRole('alert').filter({ hasText: 'This search expired.' }).waitFor(); assert.equal(await page.locator('.arr-release-result').first().getByRole('button', { name: 'Download', exact: true }).isDisabled(), true); releaseMode = 'normal'; await button('Search again').click(); await page.locator('.arr-release-result').first().waitFor();
    await page.getByLabel('Sort releases', { exact: true }).selectOption('priority'); releaseMode = 'grabError'; await releaseRow(0).getByRole('button', { name: 'Download', exact: true }).click(); await button('Download release').click(); await page.getByRole('alert').filter({ hasText: 'Release no longer cached.' }).waitFor(); await button('Cancel download').click(); releaseMode = 'normal';
    for (const [mode, background] of [['Dark', 'rgb(32, 34, 37)'], ['OLED', 'rgb(0, 0, 0)'], ['Light', 'rgb(255, 255, 255)']]) { await button('Done').click(); await page.locator('.nav-sidebar').getByRole('button', { name: mode, exact: true }).click(); await button('Interactive search').click(); await page.locator('.arr-release-result').first().waitFor(); await noOverflow(); assert.equal(await page.getByRole('dialog').evaluate(element => getComputedStyle(element).backgroundColor), background); }
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(); await page.screenshot({ path: `artifacts/arr/${service}-interactive-mobile.png` }); await button('Done').click(); await page.setViewportSize({ width: 1680, height: 1120 });
    slow = true; await page.getByRole('searchbox', { name: `Search ${name} library`, exact: true }).fill('not-present');
    await page.getByRole('status').filter({ hasText: 'Loading library' }).waitFor(); assert.equal(await page.locator('.arr-library-item').count(), 0, 'Stale filter rows are hidden');
    await page.getByText('No titles match these filters.', { exact: false }).waitFor(); slow = false;
    await page.getByRole('searchbox', { name: `Search ${name} library`, exact: true }).fill(''); await titleButton().waitFor();
    await page.getByLabel('Filter library', { exact: true }).selectOption('missing'); await titleButton().waitFor(); assert.ok(await page.locator('.arr-library-item').count() > 0);
    await section('Upcoming').click(); await page.locator('.arr-release').first().waitFor(); assert.equal(await page.locator('.arr-release').count(), tv ? 1 : 2);
    if (!tv) { await page.getByText('In cinemas', { exact: true }).waitFor(); await page.getByText('Digital release', { exact: true }).waitFor(); }
    await button('Next week').click(); await page.getByText('A quiet week.', { exact: true }).waitFor(); await button('This week').click(); await page.locator('.arr-release').first().waitFor();
    await section('Queue').click(); await page.locator('.arr-queue-row').waitFor(); assert.equal(await page.locator('progress').getAttribute('value'), '60'); await page.getByText('Check destination permissions.', { exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.arrInjected), undefined);
    await section('Missing').click(); await page.locator('.arr-missing-row').waitFor(); await button(tv ? 'Automatic search episode' : 'Automatic search movie').click(); await button('Start automatic search').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await button(tv ? '+ Add series' : '+ Add movie').click(); await page.getByRole('searchbox', { name: 'Title', exact: true }).fill('new'); await button('Find titles').click(); await page.locator('.arr-lookup-result').first().waitFor(); assert.equal(await page.locator('.arr-lookup-result').nth(1).isDisabled(), true);
    await page.locator('.arr-lookup-result').first().click(); await page.getByLabel('Root folder', { exact: true }).waitFor(); assert.equal(await page.getByLabel('Root folder', { exact: true }).locator('option').count(), 1);
    await page.getByLabel('Monitor', { exact: true }).selectOption('none'); assert.equal(await page.getByRole('checkbox').isDisabled(), true);
    await page.getByLabel('Monitor', { exact: true }).selectOption(tv ? 'future' : 'movieOnly'); await page.getByRole('checkbox').check();
    await button(tv ? 'Add series' : 'Add movie').click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); assert.equal(writes.at(-1).data.searchOnAdd, true); assert.equal(writes.at(-1).data.rootFolderId, 2);
    await titleButton().waitFor();
    for (const [mode, background] of [['Dark', 'rgb(32, 34, 37)'], ['OLED', 'rgb(0, 0, 0)'], ['Light', 'rgb(255, 255, 255)']]) { await page.locator('.nav-sidebar').getByRole('button', { name: mode, exact: true }).click(); await noOverflow(); assert.equal(await page.locator('.arr-panel').evaluate(element => getComputedStyle(element).backgroundColor), background); }
    failure = true; await button('Refresh ↻').click(); await page.getByRole('alert').filter({ hasText: 'Service denied access.' }).waitFor(); await page.waitForFunction(() => document.querySelector('.arr-top-actions button').disabled); assert.equal(await button(tv ? '+ Add series' : '+ Add movie').isDisabled(), true);
    await titleButton().click(); assert.equal(await button('Stop monitoring').isDisabled(), true); failure = false; await button('Retry connection').click(); await page.locator('.arr-page > .qb-error').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 390, height: 844 }); await noOverflow(); await button('More').click(); await page.locator('.mobile-more').getByRole('button', { name: tv ? 'Radarr' : 'Sonarr', exact: true }).click(); await page.locator('.arr-page').waitFor(); await titleButton().waitFor(); await noOverflow();
    await button('More').click(); await page.locator('.mobile-more').getByRole('button', { name, exact: true }).click(); await titleButton().waitFor(); await button(tv ? '+ Add series' : '+ Add movie').click(); await noOverflow(); await button('Close dialog').click();
    await page.setViewportSize({ width: 1680, height: 1120 });
  }
  await page.locator('.nav-item').filter({ hasText: /^Media Automation$/ }).click(); await page.locator('.arr-widget').first().waitFor(); assert.equal(await page.locator('.arr-widget').count(), 2); await page.locator('.arr-widget').first().click(); await page.locator('.arr-page').waitFor();
  assert.equal(page.context().pages().length, 1, 'Native navigation stays in the dashboard'); assert.deepEqual(errors, []);
  console.log('Both media pages passed: automatic and interactive movie/episode/season searches, releases, filters, sorting, pagination, confirmations, exact grabs, unavailable/expired results, errors, themes and mobile; existing media controls also passed. All downloads and automatic searches mocked.');
} finally { await browser.close(); }
