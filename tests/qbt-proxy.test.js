import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createQbtProxy } from '../qbt-proxy.js'
import { mergeSync, torrentGroup, modern } from '../src/qbittorrent/api.js'

async function fixture(t, fetcher) {
  const app = express()
  app.use('/qbt', createQbtProxy({ base: 'http://qbt.test:8080', username: 'test-user', password: 'test-secret', fetcher }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}/qbt/api/v2/${path}`, options)
}
for (const [status, name] of [[200, 'SID'], [204, 'QBT_SID_8080']]) {
  test(`authenticates with ${name}, coalesces concurrent logins and keeps cookies private`, async t => {
    let logins = 0
    const request = await fixture(t, async (url, options) => {
      if (url.endsWith('/auth/login')) { logins++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(null, { status, headers: { 'set-cookie': `${name}=secret-session; HttpOnly; path=/` } }) }
      assert.equal(options.headers.Cookie, `${name}=secret-session`)
      assert.equal(options.headers.Origin, 'http://qbt.test:8080')
      assert.equal(options.headers.Referer, 'http://qbt.test:8080/')
      return new Response('v5.2.3', { headers: { 'set-cookie': 'internal-only=1' } })
    })
    const responses = await Promise.all([request('app/version'), request('app/version')])
    assert.equal(logins, 1)
    for (const response of responses) { assert.equal(response.status, 200); assert.equal(response.headers.has('set-cookie'), false); assert.equal(await response.text(), 'v5.2.3') }
  })
}
test('refreshes an expired session exactly once for concurrent requests', async t => {
  let logins = 0
  const request = await fixture(t, async (url, options) => {
    if (url.endsWith('/auth/login')) { logins++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(null, { status: 204, headers: { 'set-cookie': `QBT_SID_8080=session-${logins}` } }) }
    return options.headers.Cookie.endsWith('1') ? new Response('Forbidden', { status: 403 }) : new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  })
  const responses = await Promise.all([request('transfer/info'), request('torrents/info')])
  assert.equal(logins, 2)
  responses.forEach(response => assert.equal(response.status, 200))
})
test('rejects cross-site writes and unknown endpoints before contacting qBittorrent', async t => {
  let calls = 0
  const request = await fixture(t, async () => { calls++; return new Response('') })
  assert.equal((await request('torrents/delete', { method: 'POST' })).status, 403)
  assert.equal((await request('torrents/delete', { method: 'POST', headers: { 'X-2ez-qbt': '1', Origin: 'https://attacker.test' } })).status, 403)
  assert.equal((await request('torrents/delete')).status, 404)
  assert.equal((await request('app/shutdown', { method: 'POST', headers: { 'X-2ez-qbt': '1' } })).status, 404)
  assert.equal(calls, 0)
})
test('forwards multipart bytes and mutations without changing their targets', async t => {
  const received = []
  const request = await fixture(t, async (url, options) => {
    if (url.endsWith('/auth/login')) return new Response(null, { status: 204, headers: { 'set-cookie': 'SID=session' } })
    received.push({ url, body: options.body.toString(), type: options.headers['Content-Type'] })
    return new Response('Ok.')
  })
  const form = new FormData(); form.append('torrents', new Blob(['torrent-file-bytes']), 'example.torrent'); form.append('stopped', 'true')
  assert.equal((await request('torrents/add', { method: 'POST', headers: { 'X-2ez-qbt': '1' }, body: form })).status, 200)
  assert.match(received[0].type, /multipart\/form-data; boundary=/)
  assert.match(received[0].body, /torrent-file-bytes/)
  assert.match(received[0].body, /name="stopped"\r\n\r\ntrue/)
  await request('torrents/delete', { method: 'POST', headers: { 'X-2ez-qbt': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'hashes=selected-hash&deleteFiles=false' })
  assert.equal(received[1].body, 'hashes=selected-hash&deleteFiles=false')
})
test('backs off failed authentication instead of repeatedly trying credentials', async t => {
  let logins = 0
  const request = await fixture(t, async () => { logins++; return new Response('Fails.') })
  assert.equal((await request('app/version')).status, 502)
  assert.equal((await request('app/version')).status, 503)
  assert.equal(logins, 1)
})
test('merges incremental updates without losing fields and removes deleted entries', () => {
  const initial = mergeSync({}, { full_update: true, rid: 1, torrents: { abc: { name: 'Example', state: 'downloading', dlspeed: 1 } }, categories: { Linux: { savePath: '/data' } }, tags: ['keep'], server_state: { dl_info_speed: 100, free_space_on_disk: 1000 } })
  const updated = mergeSync(initial, { rid: 2, torrents: { abc: { dlspeed: 200 } }, tags: ['new'], server_state: { dl_info_speed: 200 } })
  assert.equal(updated.torrents.abc.name, 'Example')
  assert.equal(updated.torrents.abc.dlspeed, 200)
  assert.equal(initial.torrents.abc.dlspeed, 1)
  assert.equal(updated.server_state.free_space_on_disk, 1000)
  const removed = mergeSync(updated, { rid: 3, torrents_removed: ['abc'], categories_removed: ['Linux'], tags_removed: ['keep'] })
  assert.deepEqual(removed.torrents, {})
  assert.deepEqual(removed.categories, {})
  assert.deepEqual(removed.tags, ['new'])
  assert.equal(torrentGroup({ state: 'stoppedDL' }), 'paused')
  assert.equal(torrentGroup({ state: 'pausedUP' }), 'paused')
  assert.equal(torrentGroup({ state: 'checkingUP' }), 'checking')
  assert.equal(torrentGroup({ state: 'missingFiles' }), 'error')
  assert.equal(modern('v5.2.3'), true)
  assert.equal(modern('v4.6.0'), false)
})
