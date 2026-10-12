import express from 'express'

// Fixed read-only widget requests. Service credentials never enter browser bundles.
export function createWidgetProxy({ env = process.env, fetcher = fetch } = {}) {
  const router = express.Router(), cache = new Map(), pending = new Map()
  const routes = {
    '/jellyfin/sessions': { base: 'JELLYFIN_BASE', fallback: 'http://127.0.0.1:8096/jellyfin', path: '/Sessions', credential: 'JELLYFIN_API_KEY', ttl: 10000, kind: 'jellyfin' },
    '/jellyfin/counts': { base: 'JELLYFIN_BASE', fallback: 'http://127.0.0.1:8096/jellyfin', path: '/Items/Counts', credential: 'JELLYFIN_API_KEY', ttl: 60000, kind: 'jellyfin' },
    '/navidrome/playing': { base: 'NAVIDROME_BASE', fallback: 'http://127.0.0.1:4533/navidrome', path: '/rest/getNowPlaying.view', credential: 'NAVIDROME_AUTH_PARAMS', ttl: 5000, kind: 'navidrome' },
    '/navidrome/artists': { base: 'NAVIDROME_BASE', fallback: 'http://127.0.0.1:4533/navidrome', path: '/rest/getArtists.view', credential: 'NAVIDROME_AUTH_PARAMS', ttl: 120000, kind: 'navidrome' },
    '/navidrome/albums': { base: 'NAVIDROME_BASE', fallback: 'http://127.0.0.1:4533/navidrome', path: '/rest/getAlbumList2.view', credential: 'NAVIDROME_AUTH_PARAMS', ttl: 60000, kind: 'navidrome', query: { type: 'newest', size: '3' } },
    '/speedtest/latest': { base: 'SPEEDTEST_BASE', fallback: 'http://127.0.0.1:8083', path: '/api/v1/results/latest', credential: 'SPEEDTEST_API_TOKEN', ttl: 60000, kind: 'speedtest' },
  }
  router.use(async (req, res) => {
    res.set('Cache-Control', 'no-store')
    const route = routes[req.path]
    if (req.method !== 'GET' || !route || req.url.includes('?')) return res.status(404).json({ error: 'Unsupported widget operation.' })
    if (!env[route.credential]) return res.status(503).json({ error: 'Configure this widget’s server credentials.' })
    try {
      let entry = cache.get(req.path)
      if (!entry || Date.now() - entry.time >= route.ttl) {
        if (!pending.has(req.path)) pending.set(req.path, (async () => {
          const url = new URL((env[route.base] || route.fallback).replace(/\/$/, '') + route.path)
          const headers = { Accept: 'application/json' }
          if (route.kind === 'jellyfin') headers['X-Emby-Token'] = env[route.credential]
          if (route.kind === 'speedtest') headers.Authorization = `Bearer ${env[route.credential]}`
          if (route.kind === 'navidrome') url.search = new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(env[route.credential])), ...route.query }).toString()
          const response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) })
          if (!response.ok) throw Object.assign(new Error('Widget service unavailable.'), { status: [401, 403].includes(response.status) ? 403 : 502 })
          const value = { data: await response.json(), time: Date.now() }
          cache.set(req.path, value)
          return value
        })().finally(() => pending.delete(req.path)))
        entry = await pending.get(req.path)
      }
      res.json(entry.data)
    } catch (error) { res.status(error.status || 502).json({ error: 'Widget service unavailable. Check its server connection and credentials.' }) }
  })
  return router
}
