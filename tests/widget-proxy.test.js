import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createWidgetProxy } from '../widget-proxy.js'

test('widget reads keep credentials server-side, coalesce requests, and reject arbitrary routes', async t => {
  const calls = []
  const app = express(); app.use('/widget-api', createWidgetProxy({ env: { JELLYFIN_API_KEY: 'server-secret', NAVIDROME_AUTH_PARAMS: 'u=user&t=secret&s=salt&f=json' }, fetcher: async (url, options) => { calls.push({ url: String(url), headers: options.headers }); await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ sample: true }) } }))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}/widget-api`
  const responses = await Promise.all([fetch(base + '/jellyfin/sessions'), fetch(base + '/jellyfin/sessions')])
  for (const response of responses) assert.deepEqual(await response.json(), { sample: true })
  assert.equal(calls.length, 1); assert.equal(calls[0].headers['X-Emby-Token'], 'server-secret')
  assert.equal((await fetch(base + '/jellyfin/sessions?url=http://evil.test')).status, 404)
  assert.equal((await fetch(base + '/jellyfin/sessions', { method: 'POST' })).status, 404)
  assert.equal((await fetch(base + '/speedtest/latest')).status, 503)
  assert.equal((await fetch(base + '/navidrome/albums')).status, 200)
  const url = new URL(calls.at(-1).url); assert.equal(url.searchParams.get('size'), '3'); assert.equal(url.searchParams.get('t'), 'secret')
})
