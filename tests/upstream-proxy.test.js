import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import { createUpstreamProxy } from '../upstream-proxy.js'

test('fixed upstream proxy preserves mounted paths, queries, request bytes and response headers', async t => {
  const upstream = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk }); req.on('end', () => { res.setHeader('X-Upstream', 'yes'); res.end(JSON.stringify({ url: req.url, body })) })
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const app = express(); app.use('/service', createUpstreamProxy(`http://127.0.0.1:${upstream.address().port}`, '/service'))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => Promise.all([server, upstream].map(item => new Promise(resolve => { item.close(resolve); item.closeAllConnections() }))))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/service/api?name=a%20b`, { method: 'POST', body: 'original bytes' })
  assert.equal(response.headers.get('x-upstream'), 'yes')
  assert.deepEqual(await response.json(), { url: '/service/api?name=a%20b', body: 'original bytes' })
})
