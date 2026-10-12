import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import express from 'express'
import { createAccessPolicy } from '../access-policy.js'
import { attachTerminal } from '../terminal-server.js'

const origins = 'https://dashboard.test,http://127.0.0.1:3080'
const policy = createAccessPolicy({ origins })
const request = (headers = {}, peer = '127.0.0.1') => ({ socket: { remoteAddress: peer }, headers: { host: 'dashboard.test', ...headers } })
test('access boundary accepts only loopback or verified tailnet proxy clients and configured hosts', () => {
  assert.ok(policy.permits(request()))
  assert.ok(policy.permits(request({ 'x-forwarded-for': '100.70.1.2' })))
  assert.ok(policy.permits(request({ 'x-forwarded-for': 'fd7a:115c:a1e0::123' })))
  for (const req of [request({}, '192.168.1.20'), request({ host: 'rebound.attacker.test' }), request({ origin: 'https://evil.test' }), request({ 'x-forwarded-for': '100.70.1.2, 192.168.1.20' }), request({ 'x-forwarded-for': 'not-an-ip' }), request({ 'sec-fetch-site': 'cross-site' })]) assert.equal(policy.permits(req), false)
  assert.equal(policy.permits(request(), true), false)
  assert.ok(policy.permits(request({ origin: 'https://dashboard.test' }), true))
})
test('WebSocket rejects missing/foreign origins before spawning and bounds sessions and input', async t => {
  const server = http.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const calls = []; let kills = 0
  const pty = { spawn: () => { calls.push('spawn'); return { onData() {}, onExit() {}, write: data => calls.push(data), resize: (...size) => calls.push(size), kill: () => { kills++ } } } }
  const local = createAccessPolicy({ origins: origin })
  const wss = attachTerminal({ httpServer: server, WebSocketServer, pty, shell: { file: 'fake', args: [] }, permits: local.permits, maxSessions: 1 })
  t.after(async () => { for (const ws of wss.clients) ws.terminate(); await new Promise(resolve => server.close(resolve)) })
  const connect = headers => new WebSocket(origin.replace('http:', 'ws:') + '/terminal', { headers })
  const rejected = async (headers, status) => {
    const ws = connect(headers)
    await new Promise((resolve, reject) => {
      ws.on('open', () => reject(new Error('Unexpected accepted connection')))
      ws.on('unexpected-response', (_req, response) => { try { assert.equal(response.statusCode, status); response.resume(); resolve() } catch (e) { reject(e) } })
      ws.on('error', reject)
    })
  }
  await rejected({}, 403); await rejected({ Origin: 'https://evil.test' }, 403)
  assert.equal(calls.length, 0)
  const ws = connect({ Origin: origin }); await new Promise(resolve => ws.once('open', resolve))
  await rejected({ Origin: origin }, 429)
  ws.send('null'); ws.send(JSON.stringify({ type: 'resize', cols: 1000000, rows: 2 })); ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 })); ws.send(JSON.stringify({ type: 'input', data: 'marker' }))
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.deepEqual(calls, ['spawn', [100, 30], 'marker'])
  ws.close(); await new Promise(resolve => ws.once('close', resolve)); await new Promise(resolve => setImmediate(resolve))
  assert.equal(kills, 1)
})
test('legacy Docker mutation routes are retired, including dashboard forced deletion', async t => {
  const { default: router } = await import('../sys-metrics.js')
  const app = express(); app.use('/sys-api', router)
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  for (const [method, path] of [['POST', '/stop'], ['POST', '/start'], ['POST', '/restart'], ['DELETE', '']]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/sys-api/docker/2ez-dashboard${path}`, { method, headers: { Origin: 'https://evil.test' } })
    assert.equal(response.status, 410)
  }
})
