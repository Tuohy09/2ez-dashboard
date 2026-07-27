// ── sys-metrics ──────────────────────────────────────────────────
// Direct Linux-kernel system metrics, replacing the Glances backend.
// Reads /proc and /sys straight from the host and queries the Docker
// socket. Rate-based figures (CPU %, network, disk I/O, container
// stats) are produced by lightweight background samplers so every
// HTTP endpoint answers instantly (< 100 ms) instead of blocking on a
// second read.

import express from 'express'
import fs from 'fs'
import os from 'os'
import http from 'http'
import { execSync, execFileSync } from 'child_process'

// When mounted into a container we read the host's /proc and /sys via
// the bind mounts declared in docker-compose; running natively on the
// host we fall back to the real paths.
const PROC = fs.existsSync('/host/proc') ? '/host/proc' : '/proc'
const SYS  = fs.existsSync('/host/sys')  ? '/host/sys'  : '/sys'
const ETC  = fs.existsSync('/host/etc')  ? '/host/etc'  : '/etc'
// Host root bind mount (docker-compose: /:/host-root:ro); '' when native.
const HOST_ROOT = fs.existsSync('/host-root') ? '/host-root' : ''
const DOCKER_SOCK = '/var/run/docker.sock'

const getconf = (name, fallback) => {
  try { return parseInt(execFileSync('getconf', [name]).toString().trim(), 10) || fallback }
  catch { return fallback }
}
const CLK_TCK  = getconf('CLK_TCK', 100)    // jiffies per second
const PAGESIZE = getconf('PAGESIZE', 4096)  // bytes per page

const read = (p) => fs.readFileSync(p, 'utf8')
const readSafe = (p) => { try { return read(p) } catch { return null } }
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ─── UID → username map (refreshed lazily) ───────────────────────
let userMap = {}
let userMapAt = 0
function users() {
  if (Date.now() - userMapAt < 60000 && Object.keys(userMap).length) return userMap
  const txt = readSafe(`${ETC}/passwd`)
  const map = {}
  if (txt) for (const line of txt.split('\n')) {
    const f = line.split(':')
    if (f.length >= 3) map[f[2]] = f[0]
  }
  userMap = map; userMapAt = Date.now()
  return userMap
}

// ─── CPU / network / disk / swap samplers ────────────────────────
// State holds the most recently computed rates, refreshed every ~1 s.
const state = {
  cpu: { total: 0, cores: [] },
  network: [],
  diskio: [],
  swapRate: { sin: 0, sout: 0 },
}

let prevCpu = null      // { total: [idle,total], cores: [[idle,total],...] }
let prevNet = null      // { ts, ifaces: { name: {rx,tx} } }
let prevDisk = null     // { ts, disks: { name: {read,write} } }
let prevSwap = null     // { ts, in, out }  (pages)

function parseCpuStat() {
  const out = { total: null, cores: [] }
  for (const line of read(`${PROC}/stat`).split('\n')) {
    if (!line.startsWith('cpu')) continue
    const parts = line.trim().split(/\s+/)
    const label = parts[0]
    const vals = parts.slice(1).map(num)
    const idle = (vals[3] || 0) + (vals[4] || 0)        // idle + iowait
    const total = vals.reduce((a, b) => a + b, 0)
    if (label === 'cpu') out.total = [idle, total]
    else out.cores[parseInt(label.slice(3), 10)] = [idle, total]
  }
  return out
}

function sampleCpu() {
  const cur = parseCpuStat()
  const pct = ([pi, pt], [i, t]) => {
    const dt = t - pt, di = i - pi
    if (dt <= 0) return 0
    return Math.max(0, Math.min(100, (1 - di / dt) * 100))
  }
  if (prevCpu && cur.total) {
    state.cpu.total = +pct(prevCpu.total, cur.total).toFixed(1)
    state.cpu.cores = cur.cores.map((c, i) =>
      prevCpu.cores[i] ? +pct(prevCpu.cores[i], c).toFixed(1) : 0)
  }
  prevCpu = cur
}

function sampleNetwork() {
  const now = Date.now()
  const ifaces = {}
  for (const line of read(`${PROC}/net/dev`).split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/)
    if (!m) continue
    const name = m[1].trim()
    const f = m[2].trim().split(/\s+/).map(num)
    ifaces[name] = { rx: f[0] || 0, tx: f[8] || 0 }
  }
  if (prevNet) {
    const dt = (now - prevNet.ts) / 1000
    state.network = Object.entries(ifaces).map(([name, cur]) => {
      const p = prevNet.ifaces[name]
      const rate = (a, b) => (p && dt > 0 ? Math.max(0, (a - b) / dt) : 0)
      return {
        interface_name: name,
        bytes_recv_rate_per_sec: rate(cur.rx, p?.rx),
        bytes_sent_rate_per_sec: rate(cur.tx, p?.tx),
      }
    })
  }
  prevNet = { ts: now, ifaces }
}

function sampleDisk() {
  const now = Date.now()
  const disks = {}
  for (const line of read(`${PROC}/diskstats`).split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 14) continue
    const name = f[2]
    disks[name] = { read: num(f[5]) * 512, write: num(f[9]) * 512 } // sectors → bytes
  }
  if (prevDisk) {
    const dt = (now - prevDisk.ts) / 1000
    state.diskio = Object.entries(disks).map(([name, cur]) => {
      const p = prevDisk.disks[name]
      const rate = (a, b) => (p && dt > 0 ? Math.max(0, (a - b) / dt) : 0)
      return { disk_name: name, read_bytes: rate(cur.read, p?.read), write_bytes: rate(cur.write, p?.write) }
    })
  }
  prevDisk = { ts: now, disks }
}

function sampleSwapRate() {
  const now = Date.now()
  const txt = readSafe(`${PROC}/vmstat`)
  if (!txt) return
  let sin = 0, sout = 0
  for (const line of txt.split('\n')) {
    const [k, v] = line.split(/\s+/)
    if (k === 'pswpin') sin = num(v)
    if (k === 'pswpout') sout = num(v)
  }
  if (prevSwap) {
    const dt = (now - prevSwap.ts) / 1000
    if (dt > 0) state.swapRate = {
      sin: Math.max(0, (sin - prevSwap.in) * PAGESIZE / dt),
      sout: Math.max(0, (sout - prevSwap.out) * PAGESIZE / dt),
    }
  }
  prevSwap = { ts: now, in: sin, out: sout }
}

function tick() {
  try { sampleCpu() } catch { /* transient /proc read race */ }
  try { sampleNetwork() } catch { /* transient /proc read race */ }
  try { sampleDisk() } catch { /* transient /proc read race */ }
  try { sampleSwapRate() } catch { /* transient /proc read race */ }
}
tick()
setInterval(tick, 1000).unref()

// ─── Network history ring buffer ─────────────────────────────────
// One throughput sample every 5 s, retained for 24 h (~17280 points),
// for the Home page's 1-Hour / 24-Hour network graph ranges.
const LAN_IF = process.env.LAN_IFACE || 'enp3s0'
const TS_IF  = process.env.TS_IFACE  || 'tailscale0'
const HISTORY_MS = 24 * 60 * 60 * 1000
const HISTORY_STEP = 5000
const netHistory = [] // { t, lanRx, lanTx, tsRx, tsTx }

function pushNetHistory() {
  const find = (name) => state.network.find(i => i.interface_name === name)
  const lan = find(LAN_IF), ts = find(TS_IF)
  netHistory.push({
    t: Date.now(),
    lanRx: lan ? Math.round(lan.bytes_recv_rate_per_sec) : 0,
    lanTx: lan ? Math.round(lan.bytes_sent_rate_per_sec) : 0,
    tsRx:  ts  ? Math.round(ts.bytes_recv_rate_per_sec)  : 0,
    tsTx:  ts  ? Math.round(ts.bytes_sent_rate_per_sec)  : 0,
  })
  const cutoff = Date.now() - HISTORY_MS
  while (netHistory.length && netHistory[0].t < cutoff) netHistory.shift()
}
setInterval(pushNetHistory, HISTORY_STEP).unref()

// ─── Docker container sampler ────────────────────────────────────
const dockerReq = (path) => new Promise((resolve, reject) => {
  const req = http.request({ socketPath: DOCKER_SOCK, path, method: 'GET', timeout: 4000 }, (res) => {
    let body = ''
    res.on('data', c => (body += c))
    res.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
    })
  })
  req.on('error', reject)
  req.on('timeout', () => req.destroy(new Error('docker timeout')))
  req.end()
})

let containers = []
let containerNetPrev = new Map() // id → { rx, tx, ts }

function containerCpuPct(s) {
  const cpu = s.cpu_stats, pre = s.precpu_stats
  if (!cpu || !pre) return 0
  const cpuDelta = (cpu.cpu_usage?.total_usage || 0) - (pre.cpu_usage?.total_usage || 0)
  const sysDelta = (cpu.system_cpu_usage || 0) - (pre.system_cpu_usage || 0)
  const ncpu = cpu.online_cpus || cpu.cpu_usage?.percpu_usage?.length || 1
  if (sysDelta <= 0 || cpuDelta <= 0) return 0
  return +((cpuDelta / sysDelta) * ncpu * 100).toFixed(1)
}

function containerMem(s) {
  const m = s.memory_stats
  if (!m || !m.usage) return 0
  const cache = m.stats?.inactive_file ?? m.stats?.total_inactive_file ?? 0
  return Math.max(0, m.usage - cache)
}

async function sampleContainers() {
  if (!fs.existsSync(DOCKER_SOCK)) { containers = []; return }
  let list
  try { list = await dockerReq('/containers/json?all=1') } catch { containers = []; return }
  const now = Date.now()
  const results = await Promise.all((Array.isArray(list) ? list : []).map(async (c) => {
    const name = (c.Names?.[0] || c.Id?.slice(0, 12) || 'unknown').replace(/^\//, '')
    const running = c.State === 'running'
    const uptime = running ? (c.Status || '').replace(/^Up\s+/, '').replace(/\s+\(.*\)$/, '') || '—' : '—'
    let cpu = 0, mem = 0, net_rx = 0, net_tx = 0
    if (running) {
      try {
        const s = await dockerReq(`/containers/${c.Id}/stats?stream=false`)
        cpu = containerCpuPct(s)
        mem = containerMem(s)
        let rx = 0, tx = 0
        for (const n of Object.values(s.networks || {})) { rx += n.rx_bytes || 0; tx += n.tx_bytes || 0 }
        const prev = containerNetPrev.get(c.Id)
        if (prev) {
          const dt = (now - prev.ts) / 1000
          if (dt > 0) { net_rx = Math.max(0, (rx - prev.rx) / dt); net_tx = Math.max(0, (tx - prev.tx) / dt) }
        }
        containerNetPrev.set(c.Id, { rx, tx, ts: now })
      } catch { /* container vanished mid-sample */ }
    }
    return { name, status: c.State || 'stopped', cpu_percent: cpu, memory_usage: mem, network_rx: net_rx, network_tx: net_tx, uptime }
  }))
  containers = results
}

function scheduleDockerSampler() {
  sampleContainers().catch(() => {}).finally(() => setTimeout(scheduleDockerSampler, 2000).unref())
}
scheduleDockerSampler()

// ─── On-request readers ──────────────────────────────────────────
function readMeminfo() {
  const info = {}
  for (const line of read(`${PROC}/meminfo`).split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/)
    if (m) info[m[1]] = num(m[2]) * 1024 // kB → bytes
  }
  return info
}

function cpuInfo() {
  const txt = readSafe(`${PROC}/cpuinfo`) || ''
  const modelName = (txt.match(/model name\s*:\s*(.+)/) || [])[1]
  const coreIds = new Set()
  let physId = null
  for (const line of txt.split('\n')) {
    const p = line.match(/physical id\s*:\s*(\d+)/); if (p) physId = p[1]
    const c = line.match(/core id\s*:\s*(\d+)/);     if (c) coreIds.add(`${physId}:${c[1]}`)
  }
  const logical = os.cpus().length
  const physical = coreIds.size || logical
  let freq = 0 // MHz
  const khz = readSafe(`${SYS}/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq`)
  if (khz) freq = num(khz.trim()) / 1000
  else { const m = txt.match(/cpu MHz\s*:\s*([\d.]+)/); if (m) freq = num(m[1]) }
  return { modelName: modelName?.trim(), logical, physical, freq }
}

function readSensors() {
  const base = `${SYS}/class/hwmon`
  const out = []
  let dirs = []
  try { dirs = fs.readdirSync(base) } catch { return out }
  for (const d of dirs) {
    const dir = `${base}/${d}`
    const chip = (readSafe(`${dir}/name`) || '').trim()
    let files = []
    try { files = fs.readdirSync(dir) } catch { continue }
    for (const f of files) {
      const m = f.match(/^temp(\d+)_input$/)
      if (!m) continue
      const raw = readSafe(`${dir}/${f}`)
      if (raw == null) continue
      const label = (readSafe(`${dir}/temp${m[1]}_label`) || '').trim() || `${chip} ${m[1]}`
      const value = num(raw.trim()) / 1000
      const core = /coretemp|k10temp|cpu|core|package|tctl|tdie/i.test(`${chip} ${label}`)
      out.push({ label, value: +value.toFixed(1), type: core ? 'temperature_core' : 'temperature', unit: 'C' })
    }
  }
  // Keep the Temperatures card populated even on systems whose CPU
  // sensor doesn't match the heuristic above.
  if (!out.some(s => s.type === 'temperature_core')) out.forEach(s => (s.type = 'temperature_core'))
  return out
}

function formatUptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h || d) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function readFilesystems() {
  let out
  try { out = execSync('df -B1', { encoding: 'utf8', timeout: 3000 }) }
  catch { return [] }
  const lines = out.trim().split('\n').slice(1)
  const rows = []
  for (const line of lines) {
    const t = line.trim().split(/\s+/)
    if (t.length < 6) continue
    const size = num(t[t.length - 5])
    const used = num(t[t.length - 4])
    const free = num(t[t.length - 3])
    const percent = num(t[t.length - 2].replace('%', ''))
    const mnt = t.slice(5).join(' ')            // mount point (may contain spaces)
    const device = t.slice(0, t.length - 5).join(' ')
    if (size <= 0) continue

    // Real physical devices only, mounted under the host-root bind mount.
    // HOST_ROOT is '/host-root' in the container, '' when running natively.
    if (!device.startsWith('/dev/')) continue
    if (HOST_ROOT && !mnt.startsWith(HOST_ROOT)) continue
    if (/docker/.test(mnt)) continue
    if (mnt === `${HOST_ROOT}/boot/efi`) continue

    // Strip the /host-root prefix: /host-root → /, /host-root/mnt/x → /mnt/x
    const mnt_point = (HOST_ROOT ? mnt.slice(HOST_ROOT.length) : mnt) || '/'
    rows.push({ device_name: device, mnt_point, fs_type: '', size, used, free, percent })
  }
  return rows
}

// Per-process CPU% needs a delta; keep the previous snapshot and
// measure against whenever /processlist was last requested.
let prevProc = null // { ts, totalJiffies, pids: Map(pid → jiffies) }
function readProcesses() {
  const memTotal = readMeminfo().MemTotal || 1
  const uname = users()
  let totalJiffies = 0
  const cpuLine = read(`${PROC}/stat`).split('\n').find(l => l.startsWith('cpu '))
  if (cpuLine) totalJiffies = cpuLine.trim().split(/\s+/).slice(1).map(num).reduce((a, b) => a + b, 0)
  const ncpu = os.cpus().length || 1
  const totalDelta = prevProc ? totalJiffies - prevProc.totalJiffies : 0

  const pids = new Map()
  const list = []
  let entries = []
  try { entries = fs.readdirSync(PROC) } catch { return [] }
  for (const pid of entries) {
    if (!/^\d+$/.test(pid)) continue
    const statTxt = readSafe(`${PROC}/${pid}/stat`)
    if (!statTxt) continue
    // comm can contain spaces/parens — split around the last ')'.
    const close = statTxt.lastIndexOf(')')
    const open = statTxt.indexOf('(')
    const comm = statTxt.slice(open + 1, close)
    const rest = statTxt.slice(close + 2).split(/\s+/)
    const status = rest[0]                       // field 3
    const utime = num(rest[11]), stime = num(rest[12]) // fields 14,15
    const numThreads = num(rest[17])             // field 20
    const jiffies = utime + stime
    pids.set(pid, jiffies)

    let cpu = 0
    if (prevProc && prevProc.pids.has(pid) && totalDelta > 0) {
      cpu = ((jiffies - prevProc.pids.get(pid)) / totalDelta) * ncpu * 100
      cpu = Math.max(0, +cpu.toFixed(1))
    }

    const statm = readSafe(`${PROC}/${pid}/statm`)
    const rss = statm ? num(statm.split(/\s+/)[1]) * PAGESIZE : 0
    const memPct = +((rss / memTotal) * 100).toFixed(1)

    let username = 'root'
    const statusTxt = readSafe(`${PROC}/${pid}/status`)
    const uidM = statusTxt && statusTxt.match(/^Uid:\s+(\d+)/m)
    if (uidM) username = uname[uidM[1]] || uidM[1]

    const cmdRaw = readSafe(`${PROC}/${pid}/cmdline`)
    const cmdline = cmdRaw ? cmdRaw.split('\0').filter(Boolean) : [comm]

    list.push({
      pid: num(pid), name: comm, username,
      cpu_percent: cpu, memory_percent: memPct,
      num_threads: numThreads, status, cmdline: cmdline.length ? cmdline : [comm],
    })
  }
  prevProc = { ts: Date.now(), totalJiffies, pids }
  return list
}

function systemInfo() {
  const osRelease = readSafe(`${ETC}/os-release`) || ''
  const distro = (osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/) || [])[1]
  const ci = cpuInfo()
  // primary IPv4
  let ip = null
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) { ip = a; break }
    }
    if (ip) break
  }
  // default gateway from /proc/net/route (hex, little-endian)
  let gateway = null
  const routeTxt = readSafe(`${PROC}/net/route`)
  if (routeTxt) {
    for (const line of routeTxt.split('\n').slice(1)) {
      const f = line.trim().split(/\s+/)
      if (f[1] === '00000000' && f[2] && f[2] !== '00000000') {
        const h = f[2]
        gateway = [6, 4, 2, 0].map(i => parseInt(h.substr(i, 2), 16)).join('.')
        break
      }
    }
  }
  return {
    system: {
      hostname: os.hostname(),
      os_name: 'Linux',
      os_version: os.release(),
      linux_distro: distro,
      platform: os.arch(),
    },
    core: { phys_cores: ci.physical, log_cores: ci.logical },
    ip: ip ? { address: ip.address, mask: ip.netmask, gateway } : { gateway },
    backend: `direct /proc (node ${process.version})`,
  }
}

// ─── Router ──────────────────────────────────────────────────────
const router = express.Router()
const send = (res, fn) => {
  try { res.json(fn()) }
  catch (e) { res.status(500).json({ error: e.message }) }
}

router.get('/cpu', (_req, res) => send(res, () => {
  const ci = cpuInfo()
  return {
    total: state.cpu.total,
    cores: state.cpu.cores,
    model: `${ci.logical} cores`,
    freq: ci.freq,
  }
}))

router.get('/mem', (_req, res) => send(res, () => {
  const m = readMeminfo()
  const total = m.MemTotal || 0
  const available = m.MemAvailable ?? ((m.MemFree || 0) + (m.Buffers || 0) + (m.Cached || 0))
  const used = Math.max(0, total - available)
  return { total, available, used, percent: total ? +((used / total) * 100).toFixed(1) : 0 }
}))

router.get('/swap', (_req, res) => send(res, () => {
  const m = readMeminfo()
  const total = m.SwapTotal || 0
  const free = m.SwapFree || 0
  const used = Math.max(0, total - free)
  return {
    total, free, used,
    percent: total ? +((used / total) * 100).toFixed(1) : 0,
    sin: state.swapRate.sin, sout: state.swapRate.sout,
  }
}))

router.get('/network', (_req, res) => send(res, () => state.network))

// Historical throughput for the 1-Hour / 24-Hour ranges, downsampled
// to at most ~400 points so the payload stays small and the chart smooth.
router.get('/network/history', (req, res) => send(res, () => {
  const range = req.query.range === '24h' ? HISTORY_MS : 60 * 60 * 1000
  const since = Date.now() - range
  let pts = netHistory.filter(p => p.t >= since)
  const MAX = 400
  if (pts.length > MAX) {
    const bucket = Math.ceil(pts.length / MAX)
    const out = []
    for (let i = 0; i < pts.length; i += bucket) {
      const slice = pts.slice(i, i + bucket)
      const avg = (k) => Math.round(slice.reduce((s, p) => s + p[k], 0) / slice.length)
      out.push({ t: slice[slice.length - 1].t, lanRx: avg('lanRx'), lanTx: avg('lanTx'), tsRx: avg('tsRx'), tsTx: avg('tsTx') })
    }
    pts = out
  }
  return pts
}))
router.get('/diskio', (_req, res) => send(res, () => state.diskio))
router.get('/fs', (_req, res) => send(res, readFilesystems))
router.get('/sensors', (_req, res) => send(res, readSensors))
router.get('/processlist', (_req, res) => send(res, readProcesses))

router.get('/uptime', (_req, res) => send(res, () => {
  const up = num(read(`${PROC}/uptime`).split(/\s+/)[0])
  return formatUptime(up)
}))

router.get('/load', (_req, res) => send(res, () => {
  const f = read(`${PROC}/loadavg`).trim().split(/\s+/)
  return { min1: num(f[0]), min5: num(f[1]), min15: num(f[2]), cpucore: os.cpus().length }
}))

router.get('/containers', (_req, res) => send(res, () => containers))

// Glances-native alerting has no /proc equivalent; report clear.
router.get('/alert', (_req, res) => res.json([]))

router.get('/info', (_req, res) => send(res, systemInfo))

export default router
