import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import path from 'path'
import sysApi from './sys-metrics.js'
import stackManager from './stack-manager.js'
import { createQbtProxy } from './qbt-proxy.js'
import { createDockerManager } from './docker-manager.js'
import { createUnmanicProxy } from './unmanic-proxy.js'
import { createFileBrowserProxy } from './file-browser-proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Express app ──────────────────────────────────────────────────
const app = express()
app.use('/qbt', createQbtProxy())
app.use('/um-api', createUnmanicProxy())
app.use('/files-api', createFileBrowserProxy())
app.use('/docker-api', createDockerManager())

// System metrics — read straight from the Linux kernel (replaces Glances)
app.use('/sys-api', sysApi)
app.use('/stack-api', stackManager)

// Which shell the /terminal WebSocket hands out — filled in by setupTerminal().
const terminalInfo = { mode: 'disabled', label: 'off', detail: 'terminal backend unavailable' }
app.get('/terminal/info', (_req, res) => res.json(terminalInfo))

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

// The dashboard runs inside a container, where a plain shell is just the
// Alpine box — no host tools, no docker CLI, no real filesystem. Given
// `pid: host` and the caps in docker-compose.yaml we can instead nsenter
// PID 1's namespaces and hand back a shell on the server itself.
// Set TERMINAL_HOST=0 to force the in-container shell.
const HOST_SHELL_ENABLED = process.env.TERMINAL_HOST !== '0'
const HOST_USER = process.env.TERMINAL_USER || 'root'
const NSENTER_ARGS = ['-t', '1', '-m', '-u', '-i', '-n', '-p', '--']
const HOST_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'

// A host shell needs PID 1 to be the host's init, CAP_SYS_ADMIN to setns()
// into its namespaces, and a seccomp profile that permits setns. Probing
// once at startup is cheaper — and far clearer in the logs — than
// discovering the failure separately inside every session.
function probeHostShell() {
  if (!HOST_SHELL_ENABLED) return null
  const probe = spawnSync('nsenter', [...NSENTER_ARGS, '/bin/sh', '-c', 'exit 0'], { stdio: 'ignore' })
  if (probe.error || probe.status !== 0) {
    const why = probe.error ? probe.error.message : `nsenter exited ${probe.status}`
    console.warn(`[terminal] host shell unavailable (${why}) — falling back to the container shell`)
    console.warn('[terminal] to enable it the container needs pid:host, CAP_SYS_ADMIN/SYS_PTRACE/SYS_CHROOT and seccomp:unconfined')
    return null
  }
  // `su -` gives a proper login environment (host PATH, profile, HOME).
  const args = HOST_USER === 'root'
    ? [...NSENTER_ARGS, '/bin/bash', '-l']
    : [...NSENTER_ARGS, '/bin/su', '-', HOST_USER]
  return {
    file: 'nsenter',
    args,
    env: { TERM: 'xterm-256color', PATH: HOST_PATH, LANG: process.env.LANG || 'C.UTF-8' },
    cwd: '/',
  }
}

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

  const host = probeHostShell()
  const shell = host ?? {
    file: process.env.SHELL || 'bash',
    args: [],
    env: process.env,
    cwd: process.env.HOME || '/',
  }
  Object.assign(terminalInfo, host
    ? { mode: 'host', label: 'host', detail: `${HOST_USER}@host via nsenter` }
    : { mode: 'container', label: 'container', detail: `${path.basename(shell.file)} inside the dashboard container` })
  console.log(`[terminal] shell mode: ${terminalInfo.mode} — ${terminalInfo.detail}`)

  const wss = new WebSocketServer({ server: httpServer, path: '/terminal' })
  wss.on('connection', (ws) => {
    let term
    try {
      term = pty.spawn(shell.file, shell.args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: shell.cwd,
        env: shell.env,
      })
    } catch (err) {
      try { ws.send(`\r\n\x1b[31mFailed to start shell: ${err.message}\x1b[0m\r\n`); ws.close() } catch { /* ignore */ }
      return
    }

    console.log(`[terminal] session opened (${terminalInfo.mode})`)
    term.onData((d) => { try { if (ws.readyState === ws.OPEN) ws.send(d) } catch { /* ignore */ } })
    term.onExit(({ exitCode }) => {
      // A host shell that dies straight away usually means nsenter lost its
      // privileges (compose edited, container recreated) — say so rather
      // than leaving a blank pane behind.
      if (terminalInfo.mode === 'host' && exitCode !== 0) {
        try { ws.send(`\r\n\x1b[31m[host shell exited ${exitCode} — check the container still has pid:host and CAP_SYS_ADMIN]\x1b[0m\r\n`) } catch { /* ignore */ }
      }
      try { ws.close() } catch { /* ignore */ }
    })

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
