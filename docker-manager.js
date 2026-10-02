import express from 'express'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const problem = (status, message) => Object.assign(new Error(message), { status })
export const validImageReference = value => typeof value === 'string' && value.length <= 256 && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*(?:@sha256:[a-f0-9]{64})?$/.test(value)
export function dockerRequest(method, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath: '/var/run/docker.sock', method, path, timeout: 45000 }, response => {
      let body = ''
      response.on('data', chunk => { body += chunk; if (body.length > 16000000) request.destroy(problem(502, 'Docker response is too large.')) })
      response.on('error', reject)
      response.on('end', () => {
        let data
        try { data = body ? JSON.parse(body) : {} } catch { return reject(problem(502, 'Docker returned an invalid response.')) }
        if (response.statusCode >= 400) return reject(problem(response.statusCode, data.message || 'Docker request failed.'))
        resolve(data)
      })
    })
    request.on('timeout', () => request.destroy(problem(504, 'Docker timed out. Refresh to check the current state.')))
    request.on('error', reject); request.end()
  })
}
export function pullImage(reference, output) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['image', 'pull', reference], { stdio: ['ignore', 'pipe', 'pipe'] })
    let timedOut = false
    child.stdout.on('data', chunk => output(chunk.toString())); child.stderr.on('data', chunk => output(chunk.toString()))
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 600000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); if (code === 0 && !timedOut) resolve(); else reject(new Error(timedOut ? 'Pull timed out. Inspect the local images before retrying.' : `Image pull failed (exit ${code}). Review the output.`)) })
  })
}
export function createDockerManager({ request = dockerRequest, pull = pullImage } = {}) {
  const router = express.Router(), jobs = new Map(), locks = new Set()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      let sameOrigin = true
      try { if (req.get('Origin')) sameOrigin = new URL(req.get('Origin')).host === req.get('Host') } catch { sameOrigin = false }
      if (!sameOrigin || req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-2ez-docker') !== '1') return res.status(403).json({ error: 'Use Docker on this dashboard to make changes.' })
    }
    next()
  })
  router.use(express.json({ limit: '8kb' }))
  const route = handler => async (req, res, next) => { try { await handler(req, res) } catch (error) { next(error) } }
  const imageId = value => { if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw problem(400, 'Select a specific image ID.'); return encodeURIComponent(value) }
  const inventory = async () => {
    const [images, containers] = await Promise.all([request('GET', '/images/json?all=0'), request('GET', '/containers/json?all=1')])
    if (!Array.isArray(images) || !Array.isArray(containers)) throw problem(502, 'Docker inventory is unavailable.')
    return images.map(item => ({ id: item.Id, tags: (item.RepoTags || []).filter(t => t !== '<none>:<none>'), digests: item.RepoDigests || [], size: item.Size, created: item.Created, containers: containers.filter(c => c.ImageID === item.Id).map(c => ({ id: c.Id, name: (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, ''), state: c.State })) }))
  }
  router.get('/images', route(async (_req, res) => res.json(await inventory())))
  router.get('/images/:id', route(async (req, res) => {
    const data = await request('GET', `/images/${imageId(req.params.id)}/json`)
    res.json({ id: data.Id, architecture: data.Architecture, os: data.Os, created: data.Created, size: data.Size, tags: data.RepoTags || [], digests: data.RepoDigests || [], layers: data.RootFS?.Layers?.length ?? 0 })
  }))
  router.delete('/images/:id', route(async (req, res) => {
    const id = imageId(req.params.id)
    if (Object.keys(req.body || {}).length) throw problem(400, 'Unexpected image removal options.')
    if (locks.has(id)) throw problem(409, 'An operation for this image is already running.')
    locks.add(id)
    try {
      const containers = await request('GET', '/containers/json?all=1')
      if (!Array.isArray(containers)) throw problem(502, 'Cannot verify image references.')
      if (containers.some(c => c.ImageID === req.params.id)) throw problem(409, 'This image is referenced by a container, including stopped containers. Remove its containers first.')
      res.json(await request('DELETE', `/images/${id}?force=0&noprune=1`))
    } finally { locks.delete(id) }
  }))
  router.get('/jobs', (_req, res) => res.json([...jobs.values()].reverse()))
  router.post('/images/pull', route(async (req, res) => {
    const { reference } = req.body || {}
    if (!validImageReference(reference) || Object.keys(req.body || {}).some(key => key !== 'reference')) throw problem(400, 'Enter an image repository with a tag or sha256 digest.')
    if ([...jobs.values()].some(job => job.status === 'running')) throw problem(409, 'Wait for the current image pull to finish.')
    const job = { id: randomUUID(), reference, status: 'running', output: '', startedAt: Date.now() }
    while (jobs.size >= 20) jobs.delete(jobs.keys().next().value)
    jobs.set(job.id, job)
    Promise.resolve().then(() => pull(reference, text => { job.output = (job.output + text).slice(-60000) })).then(() => { job.status = 'succeeded' }).catch(error => { job.status = 'failed'; job.output = (job.output + '\n' + error.message).slice(-60000) }).finally(() => { job.finishedAt = Date.now() })
    res.status(202).json(job)
  }))
  router.post('/containers/:id/:action', route(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id) || !['start', 'stop', 'restart', 'pause', 'unpause', 'remove'].includes(req.params.action) || Object.keys(req.body || {}).length) throw problem(400, 'Invalid container operation.')
    const id = req.params.id
    if (locks.has(id)) throw problem(409, 'An operation for this container is already running.')
    locks.add(id)
    try {
      const info = await request('GET', `/containers/${id}/json`)
      if (info.Name === '/2ez-dashboard') throw problem(409, 'Manage the dashboard itself from the host terminal.')
      const action = req.params.action
      if (action === 'remove' && (info.State?.Running || info.State?.Paused)) throw problem(409, 'Stop the container before removing it.')
      await request(action === 'remove' ? 'DELETE' : 'POST', `/containers/${id}${action === 'remove' ? '?force=0&v=0' : '/' + action}`)
      res.json({ ok: true })
    } finally { locks.delete(id) }
  }))
  router.use((_req, res) => res.status(404).json({ error: 'Unsupported Docker operation.' }))
  router.use((error, _req, res, next) => { void next; res.status(error.status || 503).json({ error: error.status ? error.message : 'Cannot reach Docker. Check the service connection and retry.' }) })
  return router
}
