import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import { createStackManager } from '../stack-manager.js'

const valid = 'services:\n  app:\n    image: nginx:alpine\n'
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '2ez-stacks-test-'))
  const calls = []
  const rows = []
  let operationResolve
  let operationReject
  const run = async (args, options = {}) => {
    calls.push({ args, ...options })
    if (args[0] === 'version') return '5.5.1'
    if (args.includes('config')) {
      if (!options.input.includes('services:')) throw Object.assign(new Error('Invalid Compose configuration'), { status: 422 })
      return ''
    }
    if (args.includes('logs')) return 'app | ready\n'
    options.onOutput?.('Working…\n')
    return new Promise((resolve, reject) => { operationResolve = resolve; operationReject = reject })
  }
  const app = express()
  app.use('/stack-api', createStackManager({ root, containers: async () => rows, run }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${server.address().port}/stack-api`
  const request = async (route, method = 'GET', body, headers = {}) => {
    const response = await fetch(url + route, { method, headers: { 'Content-Type': 'application/json', 'X-2ez-manager': '1', ...headers }, body: body && JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  const create = async (name = 'test-stack') => request('/stacks', 'POST', { name, content: valid })
  return { root, request, create, rows, calls, finish: () => operationResolve(), fail: () => operationReject(new Error('Pull failed')) }
}

test('discovers saved stacks, creates without deploying, reads revisions and logs', async t => {
  const f = await fixture(t)
  assert.equal((await f.create()).status, 201)
  const list = await f.request('/stacks')
  assert.equal(list.data.stacks[0].status, 'undeployed')
  assert.equal(list.data.stacks[0].manageable, true)
  const detail = (await f.request('/stacks/test-stack')).data
  assert.equal(detail.content, valid)
  assert.match(detail.revision, /^[a-f0-9]{64}$/)
  assert.equal(f.calls.some(call => call.args.includes('up')), false)
  assert.equal((await f.request('/stacks/test-stack/logs')).data.output, 'app | ready\n')
})

test('rejects traversal, duplicate directories, invalid YAML and cross-site writes', async t => {
  const f = await fixture(t)
  for (const name of ['../escape', '-option', 'a/b', 'UPPER', 'a;whoami']) assert.equal((await f.create(name)).status, 400)
  assert.equal((await f.request('/stacks', 'POST', { name: 'bad', content: 'invalid' })).status, 422)
  await assert.rejects(fs.stat(path.join(f.root, 'bad')), { code: 'ENOENT' })
  await f.create()
  assert.equal((await f.create()).status, 409)
  assert.equal((await f.request('/stacks', 'POST', { name: 'blocked', content: valid }, { Origin: 'https://elsewhere.test' })).status, 403)
  assert.equal((await f.request('/stacks', 'POST', { name: 'blocked', content: valid }, { 'X-2ez-manager': '' })).status, 403)
})

test('validates before saving, rejects stale revisions, preserves a backup', async t => {
  const f = await fixture(t)
  await f.create()
  const detail = (await f.request('/stacks/test-stack')).data
  assert.equal((await f.request('/stacks/test-stack', 'PUT', { content: 'invalid', revision: detail.revision })).status, 422)
  assert.equal(await fs.readFile(detail.files[0], 'utf8'), valid)
  const updated = valid + '    restart: unless-stopped\n'
  const saved = await f.request('/stacks/test-stack', 'PUT', { content: updated, revision: detail.revision })
  assert.equal(saved.status, 200)
  assert.equal(await fs.readFile(saved.data.backup, 'utf8'), valid)
  assert.equal(await fs.readFile(detail.files[0], 'utf8'), updated)
  assert.equal((await f.request('/stacks/test-stack', 'PUT', { content: valid, revision: detail.revision })).status, 409)
  assert.equal((await f.request('/stacks/test-stack/actions', 'POST', { action: 'deploy', revision: detail.revision })).status, 409)
})

test('tracks command output, serializes operations and never deletes volumes', async t => {
  const f = await fixture(t)
  await f.create()
  const action = await f.request('/stacks/test-stack/actions', 'POST', { action: 'down' })
  assert.equal(action.status, 202)
  assert.equal((await f.request('/jobs/' + action.data.id)).data.output, 'Working…\n')
  assert.equal((await f.request('/stacks/test-stack/actions', 'POST', { action: 'start' })).status, 409)
  const detail = (await f.request('/stacks/test-stack')).data
  assert.equal((await f.request('/stacks/test-stack', 'PUT', { content: valid, revision: detail.revision })).status, 409)
  assert.equal(f.calls.at(-1).args.at(-1), 'down')
  assert.equal(f.calls.at(-1).args.includes('--volumes'), false)
  f.finish()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await f.request('/jobs/' + action.data.id)).data.status, 'succeeded')
  const next = await f.request('/stacks/test-stack/actions', 'POST', { action: 'pull' })
  f.fail()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await f.request('/jobs/' + next.data.id)).data.status, 'failed')
  assert.equal((await f.request('/stacks/test-stack/actions', 'POST', { action: 'exec' })).status, 400)
})

test('protects external projects, self-management, multi-file projects and linked files', async t => {
  const f = await fixture(t)
  await f.create('local')
  const row = (name, files, containerName = name, directory = f.root) => ({ Id: name, Names: ['/' + containerName], State: 'running', Status: 'Up 1 hour', Labels: { 'com.docker.compose.project': name, 'com.docker.compose.project.config_files': files, 'com.docker.compose.project.working_dir': directory } })
  f.rows.push(row('external', '/elsewhere/compose.yaml', 'external', '/elsewhere'))
  f.rows.push(row('self', path.join(f.root, 'local/compose.yaml'), '2ez-dashboard'))
  f.rows.push(row('multi', path.join(f.root, 'a.yaml') + ',' + path.join(f.root, 'b.yaml')))
  await fs.mkdir(path.join(f.root, 'linked'))
  await fs.symlink(path.join(f.root, 'local/compose.yaml'), path.join(f.root, 'linked/compose.yaml'))
  for (const name of ['external', 'self', 'multi', 'linked']) {
    assert.equal((await f.request(`/stacks/${name}`)).data.manageable, false)
    assert.equal((await f.request(`/stacks/${name}/actions`, 'POST', { action: 'stop' })).status, 403)
  }
})
