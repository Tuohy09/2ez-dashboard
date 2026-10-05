import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import express from 'express'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFileBrowserProxy } from '../file-browser-proxy.js'

let server, origin, fail = false, forbidden = false, timestamp = Date.now()
const calls = []
before(async () => {
  const app = express()
  app.use('/files-api', createFileBrowserProxy({ base: 'http://files.test', now: () => timestamp, fetcher: async (url, options) => {
    calls.push({ url, options })
    if (fail) throw new Error('private service connection details')
    if (url.endsWith('/login')) return new Response(JSON.parse(options.body).password === 'correct' ? 'upstream-token-secret' : 'Unauthorized', { status: JSON.parse(options.body).password === 'correct' ? 200 : 401 })
    if (forbidden) return new Response('private path', { status: 403 })
    if (url.includes('/resources')) return Response.json({ isDir: true, path: '/', items: [{ name: 'report.txt', size: 10 }] })
    if (url.endsWith('large.txt')) return new Response('a'.repeat(150000))
    return new Response('<script>doNotRun()</script>', { headers: { 'Content-Type': 'text/html' } })
  } }))
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  origin = `http://127.0.0.1:${server.address().port}`
})
after(() => new Promise(resolve => server.close(resolve)))
const request = (endpoint, options = {}) => fetch(`${origin}/files-api/${endpoint}`, options)
const login = async () => {
  const result = await request('session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-2ez-files': '1', Origin: origin }, body: JSON.stringify({ username: 'tuohy', password: 'correct' }) })
  assert.equal(result.status, 200)
  const cookie = result.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/files-api/)
  assert.equal(cookie.includes('upstream-token-secret'), false)
  assert.deepEqual(await result.json(), { username: 'tuohy' })
  return cookie.split(';')[0]
}
test('requires sign-in and blocks cross-site requests before contacting the upstream', async () => {
  assert.equal((await request('resources?path=/')).status, 401)
  assert.equal((await request('resources?path=/', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  assert.equal((await request('session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  assert.equal(calls.length, 0)
})
test('rejects cross-origin login even with the custom header', async () => {
  assert.equal((await request('session', { method: 'POST', headers: { 'X-2ez-files': '1', Origin: 'https://elsewhere.test' } })).status, 403)
})
test('isolates browser sessions and encodes names without forwarding dashboard credentials', async () => {
  const cookie = await login()
  const result = await request('resources?path=%2FMusic%2FMy%20Album%23', { headers: { Cookie: `${cookie}; unrelated_dashboard_cookie=do-not-forward` } })
  assert.equal(result.status, 200)
  assert.equal(calls.at(-1).url, 'http://files.test/api/resources/Music/My%20Album%23')
  assert.deepEqual(calls.at(-1).options.headers, { 'X-Auth': 'upstream-token-secret' })
  assert.equal((await request('resources?path=/', { headers: { Cookie: 'twoez_files_session=another-browser' } })).status, 401)
})
test('rejects traversal and invalid paths, and exposes no write-through API', async () => {
  const cookie = await login(); const headers = { Cookie: cookie, 'X-2ez-files': '1' }
  for (const target of ['/../etc', '/Music/./file', '/Music\\file', '/Music\0file', 'relative', ['/a', '/b']]) {
    const query = Array.isArray(target) ? 'path=/a&path=/b' : `path=${encodeURIComponent(target)}`
    assert.equal((await request(`resources?${query}`, { headers })).status, 400)
  }
  assert.equal((await request('resources?path=/', { method: 'DELETE', headers })).status, 404)
})
test('preserves permission-denied state and hides upstream details on failure', async () => {
  const cookie = await login(); forbidden = true
  const denied = await request('resources?path=/', { headers: { Cookie: cookie } }); assert.equal(denied.status, 403); assert.match((await denied.json()).error, /account cannot access/)
  forbidden = false; fail = true
  const failed = await request('resources?path=/', { headers: { Cookie: cookie } }); assert.equal(failed.status, 502); assert.equal((await failed.text()).includes('private service'), false)
  fail = false
})
test('streams downloads safely, preserves range requests, and only previews safe media types inline', async () => {
  const cookie = await login()
  const html = await request('raw?path=/index.html&inline=1', { headers: { Cookie: cookie } })
  assert.match(html.headers.get('content-type'), /application\/octet-stream/); assert.match(html.headers.get('content-disposition'), /^attachment/); assert.equal(html.headers.get('x-content-type-options'), 'nosniff'); assert.match(await html.text(), /script/)
  const image = await request('raw?path=/cover.jpg&inline=1', { headers: { Cookie: cookie, Range: 'bytes=0-10' } })
  assert.match(image.headers.get('content-type'), /image\/jpeg/); assert.match(image.headers.get('content-disposition'), /^inline/); assert.equal(calls.at(-1).options.headers.Range, 'bytes=0-10'); await image.text()
})
test('bounds text previews and returns HTML as JSON text', async () => {
  const cookie = await login()
  const large = await request('text?path=/large.txt', { headers: { Cookie: cookie } }); const data = await large.json(); assert.equal(data.text.length, 128 * 1024); assert.equal(data.truncated, true)
  const html = await request('text?path=/index.html', { headers: { Cookie: cookie } }); assert.match((await html.json()).text, /<script>/)
  assert.equal((await request('text?path=/music.flac', { headers: { Cookie: cookie } })).status, 415)
})
test('logout and expiry revoke access', async () => {
  const cookie = await login()
  assert.equal((await request('session', { method: 'DELETE', headers: { Cookie: cookie, 'X-2ez-files': '1' } })).status, 200)
  assert.equal((await request('resources?path=/', { headers: { Cookie: cookie } })).status, 401)
  const expiring = await login(); timestamp += 31 * 24 * 3600 * 1000
  assert.equal((await request('session', { headers: { Cookie: expiring } })).status, 401)
})

const tokenFor = (expires, generation) => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(expires / 1000), generation })).toString('base64url')}.signature`
async function sessionFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), '2ez-files-session-test-'))
  const sessionFile = path.join(directory, 'sessions.json')
  let time = Date.now(), generation = 0, renewStatus = 200, offline = false, renewCalls = 0, router, listener, releaseRenewal, gate
  const fetcher = async (url, options) => {
    if (offline) throw new Error('upstream not reachable')
    if (url.endsWith('/login')) return new Response(tokenFor(time + 2 * 3600000, ++generation))
    if (url.endsWith('/renew')) {
      renewCalls++
      if (gate) await gate
      assert.ok(options.headers['X-Auth'])
      return new Response(renewStatus === 200 ? tokenFor(time + 2 * 3600000, ++generation) : 'Unauthorized', { status: renewStatus })
    }
    return Response.json({ isDir: true, items: [], path: '/' })
  }
  const start = async () => {
    const app = express()
    router = createFileBrowserProxy({ base: 'http://files.test', fetcher, now: () => time, sessionFile, renewalIntervalMs: 0 })
    app.use('/files-api', router)
    listener = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)) })
  }
  const stop = async () => { router.closeFileSessions(); await new Promise(resolve => listener.close(resolve)) }
  await start()
  const request = (endpoint, options = {}) => fetch(`http://127.0.0.1:${listener.address().port}/files-api/${endpoint}`, options)
  return {
    sessionFile, request, stop, restart: async () => { await stop(); await start() }, close: async () => { await stop(); await rm(directory, { recursive: true, force: true }) },
    advance: milliseconds => { time += milliseconds }, setOffline: value => { offline = value }, rejectRenewal: () => { renewStatus = 401 }, renewalCount: () => renewCalls,
    holdRenewal: () => { gate = new Promise(resolve => { releaseRenewal = resolve }) }, releaseRenewal: () => { releaseRenewal(); gate = null },
    login: async () => {
      const result = await request('session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-2ez-files': '1' }, body: JSON.stringify({ username: 'tuohy', password: 'not-saved-password' }) })
      assert.equal(result.status, 200)
      const cookie = result.headers.get('set-cookie')
      assert.match(cookie, /Max-Age=2592000/)
      return cookie.split(';')[0]
    },
  }
}
test('persists private sessions across backend restarts without saving passwords', async () => {
  const fixture = await sessionFixture()
  try {
    const cookie = await fixture.login()
    const stored = await readFile(fixture.sessionFile, 'utf8'); assert.equal(stored.includes('not-saved-password'), false)
    assert.equal((await stat(fixture.sessionFile)).mode & 0o777, 0o600)
    for (let count = 0; count < 3; count++) assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 200)
    await fixture.restart()
    assert.deepEqual(await (await fixture.request('session', { headers: { Cookie: cookie } })).json(), { username: 'tuohy' })
    assert.equal((await fixture.request('resources?path=/', { headers: { Cookie: cookie } })).status, 200)
    assert.equal((await fixture.request('session')).status, 401)
    await fixture.request('session', { method: 'DELETE', headers: { Cookie: cookie, 'X-2ez-files': '1' } })
    await fixture.restart()
    assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 401)
  } finally { await fixture.close() }
})
test('renews and saves expiring tokens once for concurrent reload requests', async () => {
  const fixture = await sessionFixture()
  try {
    const cookie = await fixture.login(); fixture.advance(65 * 60000)
    const results = await Promise.all(Array.from({ length: 6 }, () => fixture.request('session', { headers: { Cookie: cookie } })))
    assert.ok(results.every(response => response.status === 200)); assert.equal(fixture.renewalCount(), 1)
    const saved = JSON.parse(await readFile(fixture.sessionFile, 'utf8'))
    assert.equal(JSON.parse(Buffer.from(saved.sessions[0][1].token.split('.')[1], 'base64url')).generation, 2)
    await fixture.restart(); assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 200)
    assert.equal(fixture.renewalCount(), 1)
  } finally { await fixture.close() }
})
test('retains remembered login through connection failures and revokes rejected renewals', async () => {
  const fixture = await sessionFixture()
  try {
    const cookie = await fixture.login(); fixture.advance(65 * 60000); fixture.setOffline(true)
    assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 502)
    fixture.setOffline(false); assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 200)
    fixture.advance(65 * 60000); fixture.rejectRenewal()
    assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 401)
    await fixture.restart(); assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 401)
  } finally { await fixture.close() }
})
test('sign-out during token renewal cannot restore the deleted saved session', async () => {
  const fixture = await sessionFixture()
  try {
    const cookie = await fixture.login(); fixture.advance(65 * 60000); fixture.holdRenewal()
    const reading = fixture.request('session', { headers: { Cookie: cookie } })
    while (!fixture.renewalCount()) await new Promise(resolve => setTimeout(resolve, 5))
    assert.equal((await fixture.request('session', { method: 'DELETE', headers: { Cookie: cookie, 'X-2ez-files': '1' } })).status, 200)
    fixture.releaseRenewal(); assert.equal((await reading).status, 401)
    await fixture.restart(); assert.equal((await fixture.request('session', { headers: { Cookie: cookie } })).status, 401)
  } finally { await fixture.close() }
})
