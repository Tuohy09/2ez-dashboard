import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const QBT_BASE = 'http://192.168.0.170:8080'
const QBT_CREDS = 'username=tuohy&password=Angcoops'

function qbtAuthPlugin() {
  let sid = null
  let loginPromise = null

  async function login() {
    console.log('[qbt] logging in...')
    const res = await fetch(`${QBT_BASE}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: QBT_CREDS,
    })
    const text = await res.text()
    const cookie = res.headers.get('set-cookie') ?? ''
    const m = cookie.match(/SID=([^;]+)/)
    if (m) {
      sid = m[1]
      console.log(`[qbt] login OK — body:"${text}" SID:${sid.slice(0, 8)}...`)
    } else {
      console.error(`[qbt] login FAILED — status:${res.status} body:"${text}" set-cookie:"${cookie}"`)
    }
  }

  function ensureLogin() {
    if (sid) return Promise.resolve()
    if (!loginPromise) loginPromise = login().finally(() => { loginPromise = null })
    return loginPromise
  }

  async function proxyRequest(req, res) {
    // Read body once so it can be reused on retry
    const body = await new Promise((resolve) => {
      if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined)
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })

    const url = QBT_BASE + req.url
    const extraHeaders = {}
    if (req.headers['content-type']) extraHeaders['Content-Type'] = req.headers['content-type']

    async function attempt() {
      await ensureLogin()
      return fetch(url, {
        method: req.method,
        headers: { ...extraHeaders, Cookie: `SID=${sid}` },
        body,
      })
    }

    let upstream = await attempt()

    if (upstream.status === 401 || upstream.status === 403) {
      console.log(`[qbt] got ${upstream.status} — re-logging in and retrying`)
      sid = null
      await login()
      upstream = await attempt()
    }

    res.statusCode = upstream.status

    for (const [k, v] of upstream.headers.entries()) {
      const lower = k.toLowerCase()
      // Node fetch auto-decompresses but keeps Content-Encoding, which would cause
      // the browser to double-decompress. Strip framing headers and let Node handle them.
      if (lower === 'set-cookie' || lower === 'content-encoding' ||
          lower === 'content-length' || lower === 'transfer-encoding') continue
      res.setHeader(k, v)
    }

    res.end(Buffer.from(await upstream.arrayBuffer()))
  }

  return {
    name: 'qbt-auth-proxy',
    configureServer(server) {
      // Registered before Vite's own proxy so it intercepts /qbt/* first.
      // connect strips the mount prefix, so req.url inside is already /api/v2/...
      server.middlewares.use('/qbt', (req, res) => {
        proxyRequest(req, res).catch(err => {
          console.error('[qbt] proxy error:', err.message)
          if (!res.headersSent) {
            res.statusCode = 502
            res.end(`qBittorrent proxy error: ${err.message}`)
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), qbtAuthPlugin()],
  build: { sourcemap: true },
  server: {
    proxy: {
      '/api':       { target: 'http://192.168.0.170:61208', changeOrigin: true },
      '/speedtest': { target: 'http://192.168.0.170:8083',  changeOrigin: true, rewrite: (p) => p.replace(/^\/speedtest/, '') },
    }
  }
})
