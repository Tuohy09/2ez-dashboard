import express from 'express'

const routes = new Map([
  ['GET workers/status', []], ['GET version/read', []], ['GET settings/libraries', []], ['GET pending/rescan/status', []],
  ['POST pending/tasks', ['start', 'length', 'search_value', 'library_ids', 'order_by', 'order_direction']],
  ['POST history/tasks', ['start', 'length', 'search_value', 'status', 'order_by', 'order_direction']],
  ['POST history/task/log', ['task_id']],
  ['POST workers/worker/pause', ['worker_id']], ['POST workers/worker/resume', ['worker_id']],
  ['POST workers/worker/pause/all', []], ['POST workers/worker/resume/all', []],
  ['DELETE workers/worker/terminate', ['worker_id']],
  ['POST pending/rescan', []], ['POST pending/rescan/pause', []], ['POST pending/rescan/resume', []], ['DELETE pending/rescan', []],
  ['POST pending/reorder', ['id_list', 'position']], ['DELETE pending/tasks', ['id_list']],
  ['POST pending/create', ['path', 'library_id']], ['POST history/reprocess', ['id_list', 'library_id']],
  ['DELETE history/tasks', ['id_list']],
])

export function createUnmanicProxy({ base = process.env.UNMANIC_BASE || 'http://127.0.0.1:8888/unmanic', fetcher = fetch } = {}) {
  const router = express.Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!routes.has(`${req.method} ${req.path.slice(1)}`) || req.url.includes('?')) return res.status(404).json({ error: 'Unsupported Unmanic operation.' })
    if (req.method !== 'GET') {
      let sameOrigin = true
      try { if (req.get('Origin')) sameOrigin = new URL(req.get('Origin')).host === req.get('Host') } catch { sameOrigin = false }
      if (!sameOrigin || req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-2ez-unmanic') !== '1') return res.status(403).json({ error: 'Use the dashboard to make Unmanic requests.' })
    }
    next()
  })
  router.use(express.json({ limit: '64kb' }))
  router.use(async (req, res) => {
    const endpoint = req.path.slice(1)
    const allowed = routes.get(`${req.method} ${endpoint}`)
    const data = req.body ?? {}
    const ids = value => Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every(id => Number.isSafeInteger(id) && id > 0)
    const invalid = !data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !allowed.includes(key))
      || ('id_list' in data && !ids(data.id_list)) || (allowed.includes('id_list') && !ids(data.id_list))
      || (allowed.includes('worker_id') && (typeof data.worker_id !== 'string' || !data.worker_id.trim() || data.worker_id.length > 256))
      || (allowed.includes('task_id') && !(Number.isSafeInteger(data.task_id) && data.task_id > 0))
      || ('library_id' in data && !(Number.isSafeInteger(data.library_id) && data.library_id >= 0))
      || ('library_ids' in data && (!Array.isArray(data.library_ids) || (data.library_ids.length && !ids(data.library_ids))))
      || ('start' in data && !(Number.isSafeInteger(data.start) && data.start >= 0))
      || ('length' in data && !(Number.isInteger(data.length) && data.length >= 1 && data.length <= 100))
      || ('search_value' in data && (typeof data.search_value !== 'string' || data.search_value.length > 500))
      || ('order_direction' in data && !['asc', 'desc'].includes(data.order_direction))
      || ('order_by' in data && !(endpoint === 'pending/tasks' ? ['priority', 'abspath', 'id'] : ['finish_time', 'start_time', 'task_label', 'id']).includes(data.order_by))
      || ('status' in data && !['all', 'success', 'failed'].includes(data.status))
      || (endpoint === 'pending/reorder' && !['top', 'bottom'].includes(data.position))
      || (endpoint === 'pending/create' && (typeof data.path !== 'string' || !data.path.startsWith('/') || data.path.includes('\0') || data.path.length > 4096 || !(data.library_id > 0)))
    if (invalid) return res.status(400).json({ error: 'Invalid Unmanic request. Select specific jobs and check the supplied values.' })
    try {
      const response = await fetcher(`${base.replace(/\/$/, '')}/api/v2/${endpoint}`, {
        method: req.method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: req.method === 'GET' ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(30000), redirect: 'error',
      })
      const text = await response.text()
      let result
      try { result = text ? JSON.parse(text) : {} } catch { return res.status(502).json({ error: 'Unmanic returned an unexpected response. Check the service connection.' }) }
      res.status(response.status).json(result)
    } catch { res.status(502).json({ error: 'Cannot reach Unmanic. Check the service connection and try again.' }) }
  })
  router.use((error, _req, res, next) => {
    void next
    res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'Unmanic request is too large.' : 'Invalid Unmanic JSON request.' })
  })
  return router
}
