import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createArrProxy } from '../arr-proxy.js'
import { calendarEvents } from '../src/arr/api.js'

const tvTitle = { id: 7, tvdbId: 1234, title: 'Example series', sortTitle: 'example series', year: 2020, monitored: true, statistics: { episodeCount: 10, episodeFileCount: 8 }, path: '/tv/Example', apiKey: 'must-not-leak' }
const movie = { id: 9, tmdbId: 5678, title: 'Example movie', year: 2024, monitored: true, hasFile: false, isAvailable: true, movieFile: { quality: { quality: { name: 'Bluray-1080p' } } } }
async function fixture(t, service, fetcher, config = {}) {
  const app = express(); app.use('/arr', createArrProxy({ service, base: `http://${service}.test/${service}`, apiKey: 'server-secret', fetcher, ...config }))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}/arr/`
  return (endpoint, method = 'GET', data, headers = {}) => fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-2ez-arr': '1', Cookie: 'browser=private', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(data) })
}
test('libraries filter and page accurately; API keys and upstream headers remain private', async t => {
  const calls = []
  const request = await fixture(t, 'sonarr', async (url, options) => { calls.push({ url, options }); return Response.json([tvTitle, { ...tvTitle, id: 8, title: 'Unmonitored', monitored: false }]) })
  let response = await request('library?filter=missing'); assert.equal(response.status, 200)
  const result = await response.json(); assert.equal(result.totalRecords, 1); assert.equal(result.records[0].id, 7); assert.equal(result.records[0].apiKey, undefined)
  assert.equal(calls[0].url, 'http://sonarr.test/sonarr/api/v3/series'); assert.equal(calls[0].options.headers['X-Api-Key'], 'server-secret'); assert.equal(calls[0].options.headers.Cookie, undefined); assert.equal(calls[0].options.redirect, 'error')
  response = await request('library?query=unmonitored'); assert.equal((await response.json()).totalRecords, 1); assert.equal(calls.length, 1, 'Library reads share the bounded cache')
  assert.equal((await request('library?filter=invalid')).status, 400); assert.equal((await request('queue?page=0')).status, 400)
  assert.equal((await request('calendar?start=invalid&end=invalid')).status, 400); assert.equal((await request('calendar?start=2026-01-01&end=2026-04-01')).status, 400)
  assert.equal((await request('library?query=a&query=b')).status, 400)
})
test('summary combines real library, missing and queue totals with health and version', async t => {
  const request = await fixture(t, 'radarr', async url => {
    if (url.endsWith('/movie')) return Response.json([movie, { ...movie, id: 10, hasFile: true }])
    if (url.endsWith('system/status')) return Response.json({ version: '6.4', apiKey: 'must-not-leak' })
    if (url.endsWith('/health')) return Response.json([{ type: 'warning', message: 'Indexer unavailable', wikiUrl: 'private' }])
    return Response.json({ totalRecords: url.includes('/queue?') ? 3 : 1 })
  })
  const result = await (await request('summary')).json(); assert.equal(result.total, 2); assert.equal(result.collected, 1); assert.equal(result.missing, 1); assert.equal(result.queue, 3)
  assert.deepEqual(result.health, [{ type: 'warning', message: 'Indexer unavailable' }]); assert.equal(result.version, '6.4')
})
test('mutations reject cross-site calls, unsupported operations, malformed and unbounded inputs', async t => {
  let calls = 0
  const request = await fixture(t, 'sonarr', async () => { calls++; return Response.json({}) })
  for (const headers of [{ Origin: 'https://foreign.test' }, { 'X-2ez-arr': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await request('monitor', 'PUT', { kind: 'title', ids: [7], monitored: false }, headers)).status, 403)
  for (const payload of [{ kind: 'title', ids: [], monitored: true }, { kind: 'title', ids: [7, 7], monitored: false }, { kind: 'title', ids: [7], monitored: 'false' }, { kind: 'title', ids: Array.from({ length: 26 }, (_, i) => i + 1), monitored: true }, { kind: 'title', ids: [7], monitored: false, deleteFiles: true }]) assert.equal((await request('monitor', 'PUT', payload)).status, 400)
  assert.equal((await request('search', 'POST', { kind: 'title', ids: [7, 8] })).status, 400)
  assert.equal((await request('search?apikey=other', 'POST', { kind: 'title', ids: [7] })).status, 400)
  assert.equal((await request('command', 'POST', { name: 'DeleteAll' })).status, 404)
  assert.equal((await request('library', 'DELETE')).status, 404)
  assert.equal(calls, 0)
})
test('targeted searches and monitoring preserve exact IDs for both services', async t => {
  const calls = []
  for (const service of ['sonarr', 'radarr']) {
    const request = await fixture(t, service, async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return Response.json({ id: 50, status: 'queued' }) })
    assert.equal((await request('monitor', 'PUT', { kind: 'title', ids: [7], monitored: false })).status, 200)
    assert.equal((await request('search', 'POST', { kind: 'title', ids: [7] })).status, 200)
    if (service === 'sonarr') {
      assert.equal((await request('monitor', 'PUT', { kind: 'episodes', ids: [11], monitored: true })).status, 200)
      assert.equal((await request('search', 'POST', { kind: 'episodes', ids: [11] })).status, 200)
    } else assert.equal((await request('episodes?seriesId=7')).status, 400)
  }
  assert.deepEqual(calls.map(call => call.body), [{ seriesIds: [7], monitored: false }, { name: 'SeriesSearch', seriesId: 7 }, { episodeIds: [11], monitored: true }, { name: 'EpisodeSearch', episodeIds: [11] }, { movieIds: [7], monitored: false }, { name: 'MoviesSearch', movieIds: [7] }])
})
test('adding resolves canonical metadata and validates configured folders and profiles', async t => {
  for (const service of ['sonarr', 'radarr']) {
    const calls = []; const tv = service === 'sonarr', entity = tv ? 'series' : 'movie', externalId = tv ? 1234 : 5678
    let present = false
    const request = await fixture(t, service, async (url, options) => {
      if (options.method === 'POST') { calls.push(JSON.parse(options.body)); present = true; return Response.json(tv ? tvTitle : movie) }
      if (url.endsWith('/qualityprofile')) return Response.json([{ id: 4, name: 'HD' }])
      if (url.endsWith('/rootfolder')) return Response.json([{ id: 2, path: '/media', accessible: true }])
      if (url.includes('/lookup?')) return Response.json([tv ? tvTitle : movie])
      if (url.endsWith(`/${entity}`)) return Response.json(present ? [tv ? tvTitle : movie] : [])
      throw new Error('Unexpected request')
    })
    const payload = { externalId, qualityProfileId: 4, rootFolderId: 2, monitor: tv ? 'future' : 'movieOnly', searchOnAdd: false, ...(tv ? { seriesType: 'anime' } : { minimumAvailability: 'released' }) }
    assert.equal((await request('add', 'POST', { ...payload, rootFolderId: 20 })).status, 400)
    assert.equal((await request('add', 'POST', { ...payload, path: '/arbitrary' })).status, 400)
    assert.equal((await request('add', 'POST', payload)).status, 201)
    assert.equal(calls[0].rootFolderPath, '/media'); assert.equal(calls[0].qualityProfileId, 4); assert.equal(calls[0].id, undefined); assert.equal(calls[0].apiKey, undefined)
    assert.equal(calls[0].addOptions[tv ? 'searchForMissingEpisodes' : 'searchForMovie'], false)
    assert.equal((await request('add', 'POST', payload)).status, 409, 'Cache invalidation detects duplicate titles after adding')
  }
})
test('permission, configuration and network errors redact connection details; covers reject HTML', async t => {
  let mode = 'denied'
  const request = await fixture(t, 'radarr', async url => {
    if (url.includes('mediacover')) return new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })
    if (mode === 'denied') return Response.json({ apiKey: 'private' }, { status: 401 })
    if (mode === 'html') return new Response('<html>Login</html>')
    throw new Error('Internal hostname and server-secret')
  })
  let response = await request('library'); assert.equal(response.status, 403); assert.match((await response.json()).error, /denied access/)
  mode = 'html'; assert.equal((await request('library')).status, 502)
  mode = 'network'; response = await request('library'); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /server-secret|hostname/)
  assert.equal((await request('cover/7')).status, 404)
  const unconfigured = await fixture(t, 'sonarr', () => { throw new Error('must not call upstream') }, { apiKey: '' })
  assert.equal((await unconfigured('library')).status, 503)
})
test('calendar shows separate movie release types and excludes out-of-range dates', () => {
  const start = new Date('2026-10-05T00:00:00Z'), end = new Date('2026-10-12T00:00:00Z')
  const events = calendarEvents([{ id: 1, title: 'Film', inCinemas: '2026-09-01', digitalRelease: '2026-10-07', physicalRelease: '2026-10-09' }], false, start, end)
  assert.deepEqual(events.map(event => event.label), ['Digital release', 'Physical release'])
  assert.equal(calendarEvents([{ id: 2, series: { title: 'Show' }, seasonNumber: 1, episodeNumber: 3, title: 'Episode', airDateUtc: '2026-10-06' }], true, start, end)[0].displayTitle, 'Show')
})

test('automatic season search targets a single series and permits specials', async t => {
  const calls = []
  const request = await fixture(t, 'sonarr', async (url, options) => { calls.push({ url, data: JSON.parse(options.body) }); return Response.json({ id: 51, status: 'queued' }) })
  assert.equal((await request('search', 'POST', { kind: 'season', ids: [7], seasonNumber: 0 })).status, 200)
  assert.deepEqual(calls[0].data, { name: 'SeasonSearch', seriesId: 7, seasonNumber: 0 })
  assert.equal((await request('search', 'POST', { kind: 'season', ids: [7] })).status, 400)
  assert.equal((await request('search', 'POST', { kind: 'season', ids: [7, 8], seasonNumber: 1 })).status, 400)
  assert.equal((await request('search', 'POST', { kind: 'title', ids: [7], seasonNumber: 1 })).status, 400)
})
test('interactive search uses exact episode, season and movie queries and hides indexer credentials', async t => {
  for (const service of ['sonarr', 'radarr']) {
    const calls = []
    const request = await fixture(t, service, async (url, options) => {
      calls.push({ url, options })
      return Response.json([{ guid: 'https://private.indexer/?apikey=private', indexerId: 3, title: 'Example release', quality: { quality: { name: 'WEB-1080p' } }, downloadAllowed: true, rejected: true, rejections: ['Existing file is better'], seeders: 42, size: 2048, customFormatScore: 5, downloadUrl: 'https://private.indexer/download?apikey=private', magnetUrl: 'secret', languages: [{ name: 'English' }] }])
    })
    const data = service === 'sonarr' ? { kind: 'episodes', id: 11 } : { kind: 'title', id: 9 }
    const response = await request('releases', 'POST', data); assert.equal(response.status, 200)
    const result = await response.json(), row = result.records[0]
    assert.match(row.token, /^[\da-f-]{36}$/); assert.equal(row.quality, 'WEB-1080p'); assert.equal(row.downloadAllowed, true); assert.equal(row.rejected, true)
    assert.deepEqual(row.rejections, ['Existing file is better']); assert.equal(row.seeders, 42); assert.doesNotMatch(JSON.stringify(result), /private|apikey|guid|downloadUrl|magnet/)
    assert.equal(calls[0].url, `http://${service}.test/${service}/api/v3/release?${service === 'sonarr' ? 'episodeId=11' : 'movieId=9'}`)
    assert.equal(calls[0].options.method, 'GET', 'Interactive lookup does not queue a download')
    if (service === 'sonarr') {
      assert.equal((await request('releases', 'POST', { kind: 'season', id: 7, seasonNumber: 0 })).status, 200)
      assert.equal(calls[1].url, 'http://sonarr.test/sonarr/api/v3/release?seriesId=7&seasonNumber=0')
      assert.equal((await request('releases', 'POST', { kind: 'title', id: 7 })).status, 400, 'A bare series query would fetch unrelated RSS releases')
    }
    assert.equal((await request('releases', 'POST', { ...data, downloadUrl: 'https://untrusted.test' })).status, 400)
    assert.equal((await request('releases', 'POST', { ...data, id: -1 })).status, 400)
    assert.equal((await request('releases', 'POST', data, { Origin: 'https://foreign.test' })).status, 403)
  }
})
test('manual grabs resolve server-held release IDs, reject overrides, and consume each handle once', async t => {
  for (const service of ['sonarr', 'radarr']) {
    const grabs = []
    const request = await fixture(t, service, async (_url, options) => {
      if (options.method === 'POST') { grabs.push(JSON.parse(options.body)); return Response.json({}) }
      return Response.json([{ guid: 'canonical-guid', indexerId: 4, title: 'Release', downloadAllowed: true, rejected: true, rejections: ['Below custom format cutoff'] }, { guid: 'unmapped', indexerId: 5, title: 'Unmapped release', downloadAllowed: false }])
    })
    const target = service === 'sonarr' ? { kind: 'season', id: 7, seasonNumber: 1 } : { kind: 'title', id: 9 }
    const rows = (await (await request('releases', 'POST', target)).json()).records
    assert.equal((await request('grab', 'POST', { token: rows[0].token, shouldOverride: true })).status, 400)
    assert.equal((await request('grab', 'POST', { token: rows[0].token }, { 'X-2ez-arr': '' })).status, 403)
    assert.equal((await request('grab', 'POST', { token: rows[1].token })).status, 409)
    assert.equal((await request('grab', 'POST', { token: rows[0].token })).status, 200)
    assert.deepEqual(grabs[0], { guid: 'canonical-guid', indexerId: 4, ...(service === 'sonarr' ? { seriesId: 7 } : { movieId: 9 }) })
    assert.equal((await request('grab', 'POST', { token: rows[0].token })).status, 409)
    assert.equal(grabs.length, 1)
  }
})
test('expired release handles and upstream cache misses require a fresh interactive search', async t => {
  let grabs = 0
  const request = await fixture(t, 'radarr', async (_url, options) => {
    if (options.method === 'POST') { grabs++; return Response.json({}, { status: 404 }) }
    return Response.json([{ guid: 'cached-release', indexerId: 4, title: 'Release', downloadAllowed: true }])
  })
  let result = await (await request('releases', 'POST', { kind: 'title', id: 9 })).json()
  let response = await request('grab', 'POST', { token: result.records[0].token }); assert.equal(response.status, 409); assert.match((await response.json()).error, /Search again/)
  result = await (await request('releases', 'POST', { kind: 'title', id: 9 })).json()
  const now = Date.now(); t.mock.method(Date, 'now', () => now + 11 * 60000)
  response = await request('grab', 'POST', { token: result.records[0].token }); assert.equal(response.status, 409); assert.match((await response.json()).error, /expired/)
  assert.equal(grabs, 1)
})
test('concurrent grabs of the same release do not duplicate the upstream download', async t => {
  let complete, started; const began = new Promise(resolve => { started = resolve }); let grabs = 0
  const request = await fixture(t, 'sonarr', async (_url, options) => {
    if (options.method === 'POST') { grabs++; started(); await new Promise(resolve => { complete = resolve }); return Response.json({}) }
    return Response.json([{ guid: 'canonical', indexerId: 4, title: 'Release', downloadAllowed: true }])
  })
  const result = await (await request('releases', 'POST', { kind: 'episodes', id: 11 })).json()
  const payload = { token: result.records[0].token }, first = request('grab', 'POST', payload)
  await began
  const second = await request('grab', 'POST', payload); assert.equal(second.status, 409)
  complete(); assert.equal((await first).status, 200); assert.equal(grabs, 1)
})
