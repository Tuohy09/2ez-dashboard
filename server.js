import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import path from 'path'
import sysApi from './sys-metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const QBT_BASE  = 'http://127.0.0.1:8080'
const QBT_CREDS = 'username=tuohy&password=Angcoops'

// ── qBittorrent auth proxy ────────────────────────────────────────
// Mirrors the Vite plugin in vite.config.js: logs in, injects the SID
// cookie, and re-authenticates automatically on 401/403.

let sid = null
let loginPromise = null

async function qbtLogin() {
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
    console.log(`[qbt] login OK — SID:${sid.slice(0, 8)}...`)
  } else {
    console.error(`[qbt] login FAILED — status:${res.status} body:"${text}" set-cookie:"${cookie}"`)
  }
}

function ensureLogin() {
  if (sid) return Promise.resolve()
  if (!loginPromise) loginPromise = qbtLogin().finally(() => { loginPromise = null })
  return loginPromise
}

async function qbtProxy(req, res) {
  // Buffer body once; reuse on retry (req stream can only be consumed once).
  const body = await new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined)
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

  // app.use('/qbt', ...) strips the '/qbt' prefix, so req.url is already /api/v2/...
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
    await qbtLogin()
    upstream = await attempt()
  }

  res.statusCode = upstream.status

  for (const [k, v] of upstream.headers.entries()) {
    const lower = k.toLowerCase()
    // Node fetch auto-decompresses but keeps Content-Encoding, which would
    // cause the browser to double-decompress. Strip framing headers.
    if (['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'].includes(lower)) continue
    res.setHeader(k, v)
  }

  res.end(Buffer.from(await upstream.arrayBuffer()))
}

// ── Express app ──────────────────────────────────────────────────
const app = express()

// qBittorrent — must be registered before the static middleware
app.use('/qbt', (req, res) => {
  qbtProxy(req, res).catch(err => {
    console.error('[qbt] proxy error:', err.message)
    if (!res.headersSent) res.status(502).end(`qBittorrent proxy error: ${err.message}`)
  })
})

// System metrics — read straight from the Linux kernel (replaces Glances)
app.use('/sys-api', sysApi)

// Standard upstream proxies
// app.use('/mount', ...) causes Express to strip the mount path before the middleware
// sees req.url, so pathRewrite re-prepends it before forwarding to the upstream.
app.use('/unmanic',   createProxyMiddleware({ target: 'http://127.0.0.1:8888',  changeOrigin: true, pathRewrite: { '^': '/unmanic'   } }))
app.use('/jellyfin',  createProxyMiddleware({ target: 'http://127.0.0.1:8096',  changeOrigin: true, pathRewrite: { '^': '/jellyfin'  } }))
app.use('/navidrome', createProxyMiddleware({ target: 'http://127.0.0.1:4533',  changeOrigin: true, pathRewrite: { '^': '/navidrome' } }))
app.use('/speedtest', createProxyMiddleware({ target: 'http://127.0.0.1:8083',  changeOrigin: true, pathRewrite: { '^': ''           } }))

// Vite build output
app.use(express.static(path.join(__dirname, 'dist')))

// SPA fallback
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3080
const server = app.listen(PORT, () => {
  console.log(`[2ez] server running on http://0.0.0.0:${PORT}`)
})

// ── WebSocket terminal ────────────────────────────────────────────
// Spawns an interactive shell via node-pty and pipes it over a
// WebSocket at /terminal for the xterm.js front-end. Dependencies are
// loaded lazily so a missing native build of node-pty disables the
// terminal without taking down the rest of the dashboard.
// NOTE: this grants a full shell to anyone who can reach the server —
// it is intended for the private, Tailscale-only homelab dashboard.
async function setupTerminal(httpServer) {
  let WebSocketServer, pty
  try {
    ;({ WebSocketServer } = await import('ws'))
    const mod = await import('node-pty')
    pty = mod.default && mod.default.spawn ? mod.default : mod
    if (typeof pty.spawn !== 'function') throw new Error('node-pty.spawn unavailable')
  } catch (err) {
    console.warn(`[terminal] disabled — ${err.message}`)
    return
  }

  const wss = new WebSocketServer({ server: httpServer, path: '/terminal' })
  wss.on('connection', (ws) => {
    let term
    try {
      const shell = process.env.SHELL || 'bash'
      term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || '/',
        env: process.env,
      })
    } catch (err) {
      try { ws.send(`\r\n\x1b[31mFailed to start shell: ${err.message}\x1b[0m\r\n`); ws.close() } catch { /* ignore */ }
      return
    }

    console.log('[terminal] session opened')
    term.onData((d) => { try { if (ws.readyState === ws.OPEN) ws.send(d) } catch { /* ignore */ } })
    term.onExit(() => { try { ws.close() } catch { /* ignore */ } })

    ws.on('message', (raw) => {
      let m
      try { m = JSON.parse(raw.toString()) } catch { return }
      if (m.type === 'input' && typeof m.data === 'string') term.write(m.data)
      else if (m.type === 'resize' && m.cols > 0 && m.rows > 0) { try { term.resize(m.cols, m.rows) } catch { /* ignore */ } }
    })
    const kill = () => { try { term.kill() } catch { /* ignore */ } }
    ws.on('close', () => { console.log('[terminal] session closed'); kill() })
    ws.on('error', kill)
  })
  console.log('[terminal] websocket endpoint ready at /terminal')
}
setupTerminal(server)
