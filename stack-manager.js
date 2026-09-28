import express from 'express'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

const composeNames = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']
const actions = { deploy: ['up', '-d'], start: ['start'], stop: ['stop'], restart: ['restart'], pull: ['pull'], down: ['down'] }
const hash = value => createHash('sha256').update(value).digest('hex')
const problem = (status, message) => Object.assign(new Error(message), { status })
const inside = (root, file) => file === root || file.startsWith(root + path.sep)

export function dockerContainers(socketPath = '/var/run/docker.sock') {
  return new Promise((resolve, reject) => {
    const request = http.get({ socketPath, path: '/containers/json?all=1' }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(problem(response.statusCode === 403 ? 403 : 503, 'Docker access failed. Check the socket permissions.'))
        try { resolve(JSON.parse(body)) } catch { reject(problem(502, 'Docker returned an invalid response.')) }
      })
    })
    request.setTimeout(8000, () => request.destroy(new Error('Docker connection timed out.')))
    request.on('error', reject)
  })
}

// Argument arrays only: neither stack names nor Compose content pass through a shell.
export function runCompose(args, { cwd, input, onOutput = () => {}, timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', '--ansi', 'never', ...args], {
      cwd, env: { ...process.env, COMPOSE_INTERACTIVE_NO_CLI: '1', COMPOSE_PROGRESS: 'plain' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    let timedOut = false
    const append = chunk => { const text = chunk.toString(); output = (output + text).slice(-100000); onOutput(text) }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.stdin.on('error', () => { /* An early CLI exit may close stdin before validation finishes. */ })
    child.stdin.end(input)
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0 && !timedOut) resolve(output)
      else reject(problem(422, timedOut ? 'Operation timed out. Refresh the stack to check its current state.' : output.trim() || `Docker Compose exited with code ${code}.`))
    })
  })
}

export function createStackManager({ root = process.env.STACKS_DIR || '/opt/stacks', hostRoot = process.env.STACK_HOST_ROOT || '', containers = dockerContainers, run = runCompose } = {}) {
  const router = express.Router()
  const jobs = new Map()
  const locks = new Set()
  root = path.resolve(root)
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  router.use((req, res, next) => {
    if (req.method !== 'GET' && (req.get('X-2ez-manager') !== '1' || req.get('Sec-Fetch-Site') === 'cross-site' || (req.get('Origin') && new URL(req.get('Origin')).host !== req.get('Host')))) {
      return res.status(403).json({ error: 'Open Stack Manager on this dashboard to make changes.' })
    }
    next()
  })
  router.use(express.json({ limit: '256kb' }))
  const route = handler => async (req, res, next) => { try { await handler(req, res) } catch (error) { next(error) } }

  async function inventory() {
    const all = await containers()
    const stacks = new Map()
    for (const item of all) {
      const labels = item.Labels || {}
      const name = labels['com.docker.compose.project']
      if (!name) continue
      if (!stacks.has(name)) stacks.set(name, { name, files: new Set(), workingDirs: new Set(), containers: [], protected: false })
      const stack = stacks.get(name)
      for (const file of (labels['com.docker.compose.project.config_files'] || '').split(',').filter(Boolean)) stack.files.add(file)
      if (labels['com.docker.compose.project.working_dir']) stack.workingDirs.add(labels['com.docker.compose.project.working_dir'])
      const containerName = (item.Names?.[0] || item.Id.slice(0, 12)).replace(/^\//, '')
      stack.protected ||= containerName === '2ez-dashboard'
      stack.containers.push({ id: item.Id, name: containerName, service: labels['com.docker.compose.service'] || containerName, image: item.Image, state: item.State, status: item.Status })
    }
    let directories = []
    try { directories = [root, ...(await fs.readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => path.join(root, entry.name))] }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    // Include saved, undeployed stacks. Existing Docker labels take precedence.
    for (const directory of directories) {
      for (const filename of composeNames) {
        const file = path.join(directory, filename)
        try { await fs.access(file) } catch { continue }
        const owner = [...stacks.values()].find(stack => stack.files.has(file))
        if (!owner) {
          const name = path.basename(directory)
          if (!stacks.has(name)) stacks.set(name, { name, files: new Set([file]), workingDirs: new Set([directory]), containers: [], protected: false })
        }
        break
      }
    }
    return Promise.all([...stacks.values()].map(async stack => {
      const files = [...stack.files]
      const dirs = [...stack.workingDirs]
      const directory = dirs[0] || (files[0] ? path.dirname(files[0]) : '')
      let reason = ''
      if (stack.protected) reason = 'Manage the dashboard itself from the host terminal.'
      else if (files.length !== 1 || dirs.length > 1) reason = 'This project uses multiple Compose files. Manage it from the host to preserve its configuration.'
      else if (!inside(root, directory) || !inside(root, files[0])) reason = `This project is outside ${root}. Container controls are available in Docker.`
      else {
        try {
          const [realRoot, realFile, realDir] = await Promise.all([fs.realpath(root), fs.realpath(files[0]), fs.realpath(directory)])
          if (!inside(realRoot, realFile) || !inside(realRoot, realDir)) reason = 'This Compose file points outside the stacks directory.'
          else if ((await fs.lstat(files[0])).isSymbolicLink()) reason = 'Edit this linked Compose file from the host.'
        } catch { reason = 'Compose file is missing or inaccessible. Restore it on the host.' }
      }
      const running = stack.containers.filter(c => c.state === 'running').length
      const unhealthy = stack.containers.some(c => c.state === 'restarting' || c.status?.includes('(unhealthy)'))
      return { name: stack.name, files, directory, containers: stack.containers, running, total: stack.containers.length, status: unhealthy ? 'attention' : running === stack.containers.length && running > 0 ? 'running' : running > 0 ? 'partial' : stack.containers.length ? 'stopped' : 'undeployed', manageable: !reason, reason, job: [...jobs.values()].find(j => j.stack === stack.name && j.status === 'running')?.id || null }
    }))
  }
  async function find(name, writable = false) {
    const stack = (await inventory()).find(item => item.name === name)
    if (!stack) throw problem(404, 'Stack not found. Refresh the stack list.')
    if (writable && !stack.manageable) throw problem(403, stack.reason)
    return stack
  }
  const composeArgs = stack => ['--project-name', stack.name, '--project-directory', stack.directory, ...stack.files.flatMap(file => ['-f', file])]
  async function read(stack) {
    if (stack.files.length !== 1) return { content: null, revision: null }
    const file = stack.files[0]
    if (!path.isAbsolute(file)) return { content: null, revision: null }
    const target = inside(root, file) ? file : path.join(hostRoot, file)
    try {
      if ((await fs.stat(target)).size > 256000) throw problem(413, 'Compose file is too large for this editor.')
      const content = await fs.readFile(target, 'utf8')
      return { content, revision: hash(content) }
    } catch (error) {
      if (error.status) throw error
      return { content: null, revision: null }
    }
  }
  function contentBody(req) {
    if (typeof req.body?.content !== 'string' || !req.body.content.trim()) throw problem(400, 'Enter a Compose configuration first.')
    return req.body.content
  }
  async function validate(stack, content) {
    // stdin + explicit project directory preserves relative mounts and .env resolution.
    return run(['--project-name', stack.name, '--project-directory', stack.directory, '-f', '-', 'config', '--quiet'], { cwd: stack.directory, input: content, timeout: 20000 })
  }
  async function exclusive(name, work) {
    if (locks.has(name)) throw problem(409, 'An operation is already running for this stack.')
    locks.add(name)
    try { return await work() } finally { locks.delete(name) }
  }

  router.get('/stacks', route(async (_req, res) => {
    const stacks = await inventory()
    let engine = ''
    try { engine = (await run(['version', '--short'], { timeout: 5000 })).trim() } catch { /* Report disabled Compose actions while keeping inventory visible. */ }
    res.json({ stacks: stacks.sort((a, b) => a.name.localeCompare(b.name)), root, composeVersion: engine })
  }))
  router.get('/stacks/:name', route(async (req, res) => {
    const stack = await find(req.params.name)
    res.json({ ...stack, ...await read(stack), job: stack.job || [...jobs.values()].reverse().find(job => job.stack === stack.name)?.id || null })
  }))
  router.post('/stacks', route(async (req, res) => {
    const name = req.body?.name
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(name)) throw problem(400, 'Use 1–63 lowercase letters, numbers, hyphens or underscores for the stack name.')
    const content = contentBody(req)
    await exclusive(name, async () => {
      if ((await inventory()).some(stack => stack.name === name)) throw problem(409, 'A stack with that name already exists.')
      await fs.mkdir(root, { recursive: true })
      const owner = await fs.stat(root)
      const directory = path.join(root, name)
      try { await fs.mkdir(directory) } catch (error) { if (error.code === 'EEXIST') throw problem(409, 'A directory with that name already exists. Choose another stack name.'); throw error }
      try {
        await validate({ name, directory }, content)
        await fs.writeFile(path.join(directory, 'compose.yaml'), content, { flag: 'wx', mode: 0o600 })
        await fs.chown(path.join(directory, 'compose.yaml'), owner.uid, owner.gid)
        await fs.chown(directory, owner.uid, owner.gid)
      } catch (error) { await fs.rmdir(directory).catch(() => {}); throw error }
      res.status(201).json({ name })
    })
  }))
  router.post('/stacks/:name/validate', route(async (req, res) => {
    const stack = await find(req.params.name, true)
    const output = await validate(stack, contentBody(req))
    res.json({ valid: true, output })
  }))
  router.put('/stacks/:name', route(async (req, res) => {
    await exclusive(req.params.name, async () => {
      const stack = await find(req.params.name, true)
      const content = contentBody(req)
      const current = await read(stack)
      if (!current.revision || req.body.revision !== current.revision) throw problem(409, 'This file changed on disk. Reload it before saving to avoid overwriting another edit.')
      await validate(stack, content)
      // Check again after validation, which may take several seconds.
      if ((await read(stack)).revision !== current.revision) throw problem(409, 'This file changed during validation. Reload it and try again.')
      const file = stack.files[0]
      const backup = `${file}.2ez-backup-${Date.now()}-${randomUUID().slice(0, 8)}`
      const temp = `${file}.2ez-${randomUUID()}.tmp`
      const stat = await fs.stat(file)
      try {
        await fs.copyFile(file, backup, 1)
        await fs.chmod(backup, 0o600)
        await fs.chown(backup, stat.uid, stat.gid)
        await fs.writeFile(temp, content, { flag: 'wx', mode: stat.mode & 0o777 })
        await fs.chown(temp, stat.uid, stat.gid)
        await fs.rename(temp, file)
      } finally { await fs.rm(temp, { force: true }) }
      res.json({ revision: hash(content), backup })
    })
  }))
  router.get('/stacks/:name/logs', route(async (req, res) => {
    const stack = await find(req.params.name, true)
    const output = await run([...composeArgs(stack), 'logs', '--no-color', '--tail', '100'], { cwd: stack.directory, timeout: 15000 })
    res.json({ output })
  }))
  router.post('/stacks/:name/actions', route(async (req, res) => {
    const action = req.body?.action
    if (!Object.hasOwn(actions, action)) throw problem(400, 'Unknown stack action.')
    const stack = await find(req.params.name, true)
    if (locks.has(stack.name)) throw problem(409, 'An operation is already running for this stack.')
    // Never silently deploy a newer on-disk file than the one the user reviewed.
    if (action === 'deploy' && req.body.revision !== (await read(stack)).revision) throw problem(409, 'The Compose file changed. Reload and review it before deploying.')
    if (locks.has(stack.name)) throw problem(409, 'An operation is already running for this stack.')
    locks.add(stack.name)
    const job = { id: randomUUID(), stack: stack.name, action, status: 'running', output: '', startedAt: new Date().toISOString() }
    jobs.set(job.id, job)
    for (const [id, old] of jobs) { if (jobs.size <= 40) break; if (old.status !== 'running') jobs.delete(id) }
    res.status(202).json(job)
    run([...composeArgs(stack), ...actions[action]], { cwd: stack.directory, onOutput: text => { job.output = (job.output + text).slice(-100000) } })
      .then(() => { job.status = 'succeeded' })
      .catch(error => { job.status = 'failed'; job.output = (job.output + '\n' + error.message).slice(-100000) })
      .finally(() => { job.finishedAt = new Date().toISOString(); locks.delete(stack.name) })
  }))
  router.get('/jobs/:id', route(async (req, res) => {
    const job = jobs.get(req.params.id)
    if (!job) throw problem(404, 'Operation history expired after a server restart. Refresh the stack to check its current state.')
    res.json(job)
  }))
  router.use((error, _req, res, _next) => {
    // Express identifies error middleware by its four-argument signature.
    void _next
    const status = error.status || (['EACCES', 'EPERM', 'EROFS'].includes(error.code) ? 403 : error.code === 'ENOENT' ? 503 : 500)
    res.status(status).json({ error: status === 403 && !error.status ? 'Permission denied. Check the stacks directory and Docker socket access.' : error.message })
  })
  return router
}

export default createStackManager()
