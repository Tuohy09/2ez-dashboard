import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { openDownload } from '../download-stream.js'

async function fixture(t, handler) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  return `http://127.0.0.1:${server.address().port}/file`
}
test('active downloads outlive the header deadline without truncation', async t => {
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'Content-Length': '10' }); res.write('x'); let sent = 1
    const timer = setInterval(() => { res.write('x'); if (++sent === 10) { clearInterval(timer); res.end() } }, 30)
    res.on('close', () => clearInterval(timer))
  })
  const client = new EventEmitter()
  const download = await openDownload(url, { client, timeoutMs: 150 })
  let bytes = 0; for await (const chunk of download.stream()) bytes += chunk.length
  assert.equal(bytes, 10); assert.equal(client.listenerCount('close'), 0)
})
test('stalled downloads abort and release the upstream connection', async t => {
  const url = await fixture(t, (_req, res) => { res.writeHead(200); res.write('x') })
  const client = new EventEmitter(); const download = await openDownload(url, { client, timeoutMs: 100 })
  await assert.rejects(async () => { for await (const chunk of download.stream()) void chunk })
  assert.equal(client.listenerCount('close'), 0)
})
test('closing the browser cancels a pending upstream read', async t => {
  const url = await fixture(t, (_req, res) => { res.writeHead(200); res.write('x') })
  const client = new EventEmitter(); const download = await openDownload(url, { client, timeoutMs: 1000 })
  await assert.rejects(async () => { for await (const chunk of download.stream()) { void chunk; client.emit('close') } })
  assert.equal(client.listenerCount('close'), 0)
})
