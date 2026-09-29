import express from 'express'
import fs from 'node:fs'

if (fs.existsSync('.env')) process.loadEnvFile('.env')

const reads = new Set(['app/version', 'app/webapiVersion', 'app/preferences', 'transfer/info', 'transfer/speedLimitsMode', 'sync/maindata', 'sync/torrentPeers', 'torrents/info', 'torrents/properties', 'torrents/files', 'torrents/trackers', 'torrents/webseeds', 'torrents/categories', 'torrents/tags', 'torrents/export'])
const writes = new Set(['app/setPreferences', 'transfer/setDownloadLimit', 'transfer/setUploadLimit', 'transfer/toggleSpeedLimitsMode', 'torrents/add', 'torrents/start', 'torrents/stop', 'torrents/resume', 'torrents/pause', 'torrents/delete', 'torrents/recheck', 'torrents/reannounce', 'torrents/setForceStart', 'torrents/setLocation', 'torrents/setCategory', 'torrents/addTags', 'torrents/removeTags', 'torrents/createCategory', 'torrents/editCategory', 'torrents/removeCategories', 'torrents/createTags', 'torrents/deleteTags', 'torrents/setDownloadLimit', 'torrents/setUploadLimit', 'torrents/setShareLimits', 'torrents/rename', 'torrents/renameFile', 'torrents/renameFolder', 'torrents/filePrio', 'torrents/addTrackers', 'torrents/editTracker', 'torrents/removeTrackers', 'torrents/addPeers', 'torrents/increasePrio', 'torrents/decreasePrio', 'torrents/topPrio', 'torrents/bottomPrio', 'torrents/setAutoManagement', 'torrents/toggleSequentialDownload', 'torrents/toggleFirstLastPiecePrio'])

export function createQbtProxy({ base = process.env.QBT_BASE || 'http://127.0.0.1:8080', username = process.env.QBT_USERNAME, password = process.env.QBT_PASSWORD, fetcher = fetch } = {}) {
  const router = express.Router()
  const origin = new URL(base).origin
  base = base.replace(/\/$/, '')
  let cookie = ''
  let loginPromise = null
  let retryAfter = 0
  async function login() {
    if (Date.now() < retryAfter) throw Object.assign(new Error('qBittorrent authentication failed. Check the configured credentials; retrying shortly.'), { status: 503 })
    if (!username || !password) throw Object.assign(new Error('Set QBT_USERNAME and QBT_PASSWORD in the dashboard configuration.'), { status: 503 })
    if (!loginPromise) loginPromise = (async () => {
      const response = await fetcher(`${base}/api/v2/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, Referer: base + '/' }, body: new URLSearchParams({ username, password }), signal: AbortSignal.timeout(10000), redirect: 'error' })
      const cookies = response.headers.getSetCookie()
      // qBittorrent 5.2 uses QBT_SID_<port>; earlier versions use SID.
      cookie = cookies.map(value => value.split(';')[0]).filter(value => /^(SID|QBT_SID_[^=]+)=.+/.test(value)).join('; ')
      if (!response.ok || !cookie) {
        cookie = ''; retryAfter = Date.now() + 30000
        throw Object.assign(new Error('qBittorrent rejected authentication. Check the configured credentials and Web UI access.'), { status: 502 })
      }
    })().finally(() => { loginPromise = null })
    return loginPromise
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const endpoint = req.path.replace(/^\/api\/v2\//, '')
    if (!req.path.startsWith('/api/v2/') || !(req.method === 'GET' ? reads : req.method === 'POST' ? writes : new Set()).has(endpoint)) return res.status(404).json({ error: 'Unsupported qBittorrent operation.' })
    if (req.method === 'POST') {
      let sameOrigin = true
      try { if (req.get('Origin')) sameOrigin = new URL(req.get('Origin')).host === req.get('Host') } catch { sameOrigin = false }
      if (!sameOrigin || req.get('Sec-Fetch-Site') === 'cross-site' || req.get('X-2ez-qbt') !== '1') return res.status(403).json({ error: 'Use the dashboard to make qBittorrent changes.' })
    }
    next()
  })
  router.use(express.raw({ type: () => true, limit: '32mb' }))
  router.use(async (req, res) => {
    try {
      if (!cookie) await login()
      const usedCookie = cookie
      const request = () => fetcher(base + req.url, { method: req.method, headers: { Cookie: cookie, Origin: origin, Referer: base + '/', ...(req.get('Content-Type') ? { 'Content-Type': req.get('Content-Type') } : {}) }, body: req.method === 'POST' ? req.body : undefined, signal: AbortSignal.timeout(45000), redirect: 'error' })
      let response = await request()
      if (response.status === 401 || response.status === 403) {
        await response.arrayBuffer()
        if (cookie === usedCookie) { cookie = ''; await login() }
        else if (loginPromise) await loginPromise
        response = await request()
      }
      res.status(response.status)
      for (const header of ['content-type', 'content-disposition']) if (response.headers.has(header)) res.set(header, response.headers.get(header))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 502).json({ error: error.status ? error.message : 'Cannot reach qBittorrent. Check the service connection and try again.' })
    }
  })
  router.use((error, _req, res, next) => {
    void next
    res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? 'Torrent uploads must total less than 32 MB.' : 'Invalid qBittorrent request.' })
  })
  return router
}
