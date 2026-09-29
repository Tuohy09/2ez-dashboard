import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createUnmanicProxy } from '../unmanic-proxy.js'
import { encodingSpeed, number, progress, workerState } from '../src/unmanic/api.js'

async function fixture(t, fetcher) {
  const app = express(); app.use('/um-api', createUnmanicProxy({ base: 'http://unmanic.test/unmanic', fetcher }))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}/um-api/`
  return (endpoint, method = 'GET', data, extra = {}) => fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-2ez-unmanic': '1', ...extra }, body: method === 'GET' ? undefined : JSON.stringify(data || {}) })
}
test('forwards read-only POST listings and GET metadata without browser cookies', async t => {
  const calls = []
  const request = await fixture(t, async (url, options) => { calls.push({ url, options }); return Response.json({ results: [], recordsTotal: 0, recordsFiltered: 0 }) })
  assert.equal((await request('pending/tasks', 'POST', { start: 25, length: 25, library_ids: [2], search_value: 'film' }, { Cookie: 'private=secret' })).status, 200)
  assert.equal(calls[0].url, 'http://unmanic.test/unmanic/api/v2/pending/tasks')
  assert.equal(calls[0].options.headers.Cookie, undefined)
  assert.deepEqual(JSON.parse(calls[0].options.body), { start: 25, length: 25, library_ids: [2], search_value: 'film' })
  assert.equal((await request('workers/status')).status, 200)
  assert.equal(calls[1].options.body, undefined)
})
test('rejects cross-origin requests, unknown APIs, broad selections and invalid IDs', async t => {
  let calls = 0
  const request = await fixture(t, async () => { calls++; return Response.json({}) })
  assert.equal((await request('workers/worker/resume/all', 'POST', {}, { Origin: 'https://elsewhere.test' })).status, 403)
  assert.equal((await request('workers/worker/resume/all', 'POST', {}, { 'X-2ez-unmanic': '' })).status, 403)
  assert.equal((await request('workers/worker/resume/all', 'POST', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await request('settings/write', 'POST', {})).status, 404)
  assert.equal((await request('workers/status?other=1')).status, 404)
  assert.equal((await request('pending/tasks', 'DELETE', { selection_mode: 'all_filtered' })).status, 400)
  assert.equal((await request('pending/tasks', 'DELETE', { id_list: [] })).status, 400)
  assert.equal((await request('history/reprocess', 'POST', { id_list: [-1] })).status, 400)
  assert.equal((await request('pending/tasks', 'POST', { length: -1 })).status, 400)
  assert.equal((await request('pending/create', 'POST', { path: 'relative/file.mkv', library_id: 1 })).status, 400)
  assert.equal(calls, 0)
})
test('preserves targeted controls and JSON bodies for DELETE operations', async t => {
  const calls = []
  const request = await fixture(t, async (url, options) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return Response.json({ success: true }) })
  assert.equal((await request('workers/worker/pause', 'POST', { worker_id: 'group-worker-2' })).status, 200)
  assert.equal((await request('pending/reorder', 'POST', { id_list: [7, 9], position: 'top' })).status, 200)
  assert.equal((await request('pending/tasks', 'DELETE', { id_list: [7] })).status, 200)
  assert.equal((await request('history/reprocess', 'POST', { id_list: [9], library_id: 2 })).status, 200)
  assert.equal((await request('pending/create', 'POST', { path: '/library/file.mkv', library_id: 2 })).status, 200)
  assert.deepEqual(calls[0].body, { worker_id: 'group-worker-2' })
  assert.deepEqual(calls[2].body, { id_list: [7] }); assert.equal(calls[2].method, 'DELETE')
  assert.deepEqual(calls[3].body, { id_list: [9], library_id: 2 })
})
test('surfaces upstream errors, unexpected HTML and connection failures', async t => {
  let mode = 0
  const request = await fixture(t, async () => { if (mode === 0) return Response.json({ error: 'A scan is already running' }, { status: 400 }); if (mode === 1) return new Response('<html>Login required</html>'); throw new Error('socket details') })
  let response = await request('pending/rescan', 'POST'); assert.equal(response.status, 400); assert.equal((await response.json()).error, 'A scan is already running')
  mode = 1; response = await request('workers/status'); assert.equal(response.status, 502)
  mode = 2; response = await request('workers/status'); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /socket details/)
})
test('handles idle workers, unavailable progress, paused jobs and latest FFmpeg speed', () => {
  assert.equal(number('None'), null); assert.equal(number('0'), 0)
  assert.equal(progress({ idle: true, subprocess: { percent: 100 } }), null)
  assert.equal(progress({ idle: false, subprocess: { percent: 'None' } }), null)
  assert.equal(workerState({ idle: true, paused: true }), 'Paused')
  assert.equal(encodingSpeed({ worker_log_tail: ['speed=1.2x', 'speed= 2.4x'] }), '2.4x')
})
