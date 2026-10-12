import express from 'express'
import { createUpstreamProxy } from './upstream-proxy.js'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import path from 'path'
import sysApi from './sys-metrics.js'
import stackManager from './stack-manager.js'
import { createQbtProxy } from './qbt-proxy.js'
import { createDockerManager } from './docker-manager.js'
import { createUnmanicProxy } from './unmanic-proxy.js'
import { createFileBrowserProxy } from './file-browser-proxy.js'
import { createArrProxy } from './arr-proxy.js'
import { createAccessPolicy } from './access-policy.js'
import { attachTerminal } from './terminal-server.js'
import { createWidgetProxy } from './widget-proxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Express app ──────────────────────────────────────────────────
const app = express()
const access = createAccessPolicy()
app.disable('x-powered-by')
app.use(access.middleware)
app.get('/healthz', (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }))
app.use('/widget-api', createWidgetProxy())
app.use('/qbt', createQbtProxy())
app.use('/um-api', createUnmanicProxy())
app.use('/arr-api/sonarr', createArrProxy({ service: 'sonarr' }))
app.use('/arr-api/radarr', createArrProxy({ service: 'radarr' }))
app.use('/files-api', createFileBrowserProxy())
app.use('/docker-api', createDockerManager())

// System metrics — read straight from the Linux kernel (replaces Glances)
app.use('/sys-api', sysApi)
app.use('/stack-api', stackManager)

// Which shell the /terminal WebSocket hands out — filled in by setupTerminal().
const terminalInfo = { mode: 'disabled', label: 'off', detail: 'terminal backend unavailable' }
app.get('/terminal/info', (_req, res) => res.json(terminalInfo))

// Local development/full-UI routes; production Caddy also serves these upstreams.
app.use('/unmanic', createUpstreamProxy('http://127.0.0.1:8888', '/unmanic'))
app.use('/jellyfin', createUpstreamProxy('http://127.0.0.1:8096', '/jellyfin'))
app.use('/navidrome', createUpstreamProxy('http://127.0.0.1:4533', '/navidrome'))
app.use('/speedtest', createUpstreamProxy('http://127.0.0.1:8083'))

// Vite build output
app.use('/assets', express.static(path.join(__dirname, 'dist/assets'), { maxAge: '1y', immutable: true }))
app.use(express.static(path.join(__dirname, 'dist'), { setHeaders: res => res.set('Cache-Control', 'no-cache') }))

// SPA fallback
app.get(/.*/, (_req, res) => {
  res.set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3080
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[2ez] server running on http://127.0.0.1:${PORT}`)
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

  attachTerminal({ httpServer, WebSocketServer, pty, shell, permits: access.permits })
}
setupTerminal(server)
