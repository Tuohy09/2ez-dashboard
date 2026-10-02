import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import { createDockerManager, validImageReference } from '../docker-manager.js'
const id = 'a'.repeat(64), image = `sha256:${'b'.repeat(64)}`
async function fixture(t, overrides = {}) {
  const calls = [], state = { containers: [], running: false, name: '/service' }
  const request = async (method, path) => {
    calls.push({ method, path })
    if (path === '/containers/json?all=1') return state.containers
    if (path === '/images/json?all=0') return [{ Id: image, RepoTags: ['test:latest', 'test:saved'], Size: 123, Created: 100 }]
    if (path === `/containers/${id}/json`) return { Name: state.name, State: { Running: state.running } }
    return {}
  }
  const app = express(); app.use('/docker-api', createDockerManager({ request, pull: async () => {}, ...overrides }))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  return { calls, state, call: (path, method = 'GET', data, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/docker-api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-2ez-docker': '1', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(data || {}) }) }
}
test('image inventory includes all tags and stopped container references', async t => {
  const f = await fixture(t); f.state.containers = [{ Id: id, Names: ['/stopped'], State: 'exited', ImageID: image }]
  const result = await (await f.call('/images')).json()
  assert.deepEqual(result[0].tags, ['test:latest', 'test:saved']); assert.equal(result[0].containers[0].name, 'stopped')
  assert.equal((await f.call(`/images/${image}`, 'DELETE')).status, 409)
  assert.ok(f.calls.every(c => c.method === 'GET'))
})
test('image removal rechecks references and never forces or prunes parent images', async t => {
  const f = await fixture(t)
  assert.equal((await f.call(`/images/${image}`, 'DELETE')).status, 200)
  assert.deepEqual(f.calls, [{ method: 'GET', path: '/containers/json?all=1' }, { method: 'DELETE', path: `/images/${encodeURIComponent(image)}?force=0&noprune=1` }])
  f.state.containers = [{ ImageID: image }]
  assert.equal((await f.call(`/images/${image}`, 'DELETE')).status, 409)
  assert.equal((await f.call('/images/test:latest', 'DELETE')).status, 400)
})
test('rejects cross-site writes, arbitrary options and command-like references', async t => {
  const f = await fixture(t)
  for (const headers of [{ Origin: 'https://elsewhere.test' }, { Origin: 'bad url' }, { 'X-2ez-docker': '' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await f.call(`/images/${image}`, 'DELETE', {}, headers)).status, 403)
  for (const reference of ['--all-tags', 'nginx; touch /tmp/test', 'x\ny', '']) assert.equal((await f.call('/images/pull', 'POST', { reference })).status, 400)
  assert.equal((await f.call(`/images/${image}`, 'DELETE', { force: true })).status, 400)
  assert.equal((await f.call('/images/prune', 'POST')).status, 404)
  assert.equal(f.calls.length, 0)
  assert.ok(validImageReference('localhost:5000/team/app:version'))
  assert.ok(validImageReference(`alpine@sha256:${'a'.repeat(64)}`))
})
test('protects dashboard, refuses running removal and retains volumes', async t => {
  const f = await fixture(t); f.state.name = '/2ez-dashboard'
  assert.equal((await f.call(`/containers/${id}/stop`, 'POST')).status, 409)
  f.state.name = '/service'; f.state.running = true
  assert.equal((await f.call(`/containers/${id}/remove`, 'POST')).status, 409)
  f.state.running = false
  assert.equal((await f.call(`/containers/${id}/remove`, 'POST')).status, 200)
  assert.deepEqual(f.calls.at(-1), { method: 'DELETE', path: `/containers/${id}?force=0&v=0` })
  assert.equal((await f.call(`/containers/${id}/exec`, 'POST')).status, 400)
  assert.equal((await f.call('/containers/service/stop', 'POST')).status, 400)
})
test('pull jobs survive client navigation, serialize pulls and retain bounded error output', async t => {
  let finish
  const f = await fixture(t, { pull: async (reference, output) => { assert.equal(reference, 'alpine:latest'); output('x'.repeat(80000)); await new Promise(resolve => { finish = resolve }); throw new Error('Registry denied access') } })
  const job = await (await f.call('/images/pull', 'POST', { reference: 'alpine:latest' })).json()
  assert.equal(job.status, 'running')
  assert.equal((await f.call('/images/pull', 'POST', { reference: 'alpine:latest' })).status, 409)
  finish(); await new Promise(resolve => setImmediate(resolve))
  const jobs = await (await f.call('/jobs')).json(); assert.equal(jobs[0].id, job.id); assert.equal(jobs[0].status, 'failed'); assert.ok(jobs[0].output.length <= 60000); assert.match(jobs[0].output, /Registry denied/)
})
test('preserves Docker conflicts rather than reporting a successful deletion', async t => {
  const f = await fixture(t, { request: async method => { if (method === 'GET') return []; throw Object.assign(new Error('image has dependent references'), { status: 409 }) } })
  const response = await f.call(`/images/${image}`, 'DELETE'); assert.equal(response.status, 409); assert.match((await response.json()).error, /dependent references/)
})
