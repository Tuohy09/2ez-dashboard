import express from 'express'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const COOKIE = 'twoez_files_session'
const TTL = 30 * 24 * 60 * 60 * 1000
const TOKEN_FALLBACK_TTL = 12 * 60 * 60 * 1000
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp' }
const mediaTypes = { '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm' }

// Per-browser sessions keep upstream credentials and JWTs out of the frontend.
export function createFileBrowserProxy({ base = process.env.FILE_BROWSER_BASE || 'https://2ez.dinosaur-banana.ts.net:8084', fetcher = fetch, now = Date.now, sessionFile = process.env.FILE_BROWSER_SESSION_FILE || null, renewalIntervalMs = 60000 } = {}) {
  const router = express.Router()
  const sessions = new Map()
  const pendingRenewals = new Map()
  const validToken = token => typeof token === 'string' && token.length > 0 && token.length <= 16384 && !/[\r\n]/.test(token)
  const tokenTiming = token => {
    if (!validToken(token)) throw new Error('Invalid File Browser token')
    let tokenExpires = now() + TOKEN_FALLBACK_TTL
    try { const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); if (Number.isFinite(payload.exp)) tokenExpires = payload.exp * 1000 } catch { /* Support upstream deployments with opaque tokens. */ }
    if (tokenExpires <= now()) throw new Error('Expired File Browser token')
    return { tokenExpires, renewAt: now() + (tokenExpires - now()) / 2 }
  }
  const persist = () => {
    if (!sessionFile) return
    const temporary = `${sessionFile}.${randomBytes(8).toString('hex')}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, base, sessions: [...sessions] }), { mode: 0o600 })
      renameSync(temporary, sessionFile)
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* The temporary file may not have been created. */ }
      throw error
    }
  }
  if (sessionFile) {
    mkdirSync(path.dirname(sessionFile), { recursive: true, mode: 0o700 })
    try {
      const saved = JSON.parse(readFileSync(sessionFile, 'utf8'))
      if (saved.version === 1 && saved.base === base && Array.isArray(saved.sessions)) {
        for (const entry of saved.sessions.slice(0, 256)) {
          if (!Array.isArray(entry) || entry.length !== 2) continue
          const [id, session] = entry
          if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) && session && validToken(session.token)
            && typeof session.username === 'string' && session.username.length <= 256
            && Number.isFinite(session.expires) && session.expires > now() && session.expires <= now() + TTL
            && Number.isFinite(session.tokenExpires) && Number.isFinite(session.renewAt)) sessions.set(id, session)
        }
      }
    } catch (error) { if (error.code !== 'ENOENT') console.warn('[files] Saved sessions could not be loaded. Sign in to File Browser again.') }
  }
  const removeSession = id => { if (sessions.delete(id)) persist() }
  const pruneSessions = () => {
    let changed = false
    for (const [id, session] of sessions) if (session.expires <= now()) { sessions.delete(id); changed = true }
    if (changed) persist()
  }
  const sessionId = req => (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  const cookieOptions = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure || req.get('X-Forwarded-Proto') === 'https', path: '/files-api', maxAge: TTL })
  const upstream = (endpoint, options = {}) => fetcher(`${base.replace(/\/$/, '')}/api/${endpoint}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) })
  const renew = (id, session) => {
    if (pendingRenewals.has(id)) return pendingRenewals.get(id)
    const pending = (async () => {
      try {
        const response = await upstream('renew', { method: 'POST', headers: { 'X-Auth': session.token } })
        if (!response.ok) {
          const error = new Error(response.status === 401 || response.status === 403 ? 'Your File Browser session was rejected. Sign in again.' : 'Your saved login could not be restored. Check the File Browser connection and retry.')
          error.status = response.status === 401 || response.status === 403 ? 401 : 502
          if (error.status === 401 && sessions.get(id) === session) removeSession(id)
          throw error
        }
        const token = (await response.text()).trim()
        const timing = tokenTiming(token)
        // A renewal finishing after sign-out must never recreate the session.
        if (sessions.get(id) !== session || session.expires <= now()) { const error = new Error('Sign in to File Browser again.'); error.status = 401; throw error }
        Object.assign(session, { token, ...timing })
        persist()
      } catch (error) {
        if (error.status) throw error
        const failure = new Error('Your saved login could not be restored. Check the File Browser connection and retry.'); failure.status = 502
        throw failure
      }
    })().finally(() => pendingRenewals.delete(id))
    pendingRenewals.set(id, pending)
    return pending
  }
  const maintainSessions = async () => {
    pruneSessions()
    await Promise.allSettled([...sessions].filter(([, session]) => session.renewAt <= now()).map(([id, session]) => renew(id, session)))
  }
  // The running dashboard renews saved tokens even when a browser is closed.
  const renewalTimer = renewalIntervalMs > 0 ? setInterval(() => maintainSessions().catch(() => {}), renewalIntervalMs) : null
  renewalTimer?.unref()
  router.closeFileSessions = () => { if (renewalTimer) clearInterval(renewalTimer) }
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next() })
  router.use((req, res, next) => {
    if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: 'Open files from your dashboard.' })
    if (req.method !== 'GET') {
      const origin = req.get('Origin')
      let sameOrigin = !origin
      try { if (origin) sameOrigin = new URL(origin).host === req.get('Host') } catch { sameOrigin = false }
      if (!sameOrigin || req.get('X-2ez-files') !== '1') return res.status(403).json({ error: 'Use the dashboard to sign in or out.' })
    }
    pruneSessions()
    next()
  })
  router.use(express.json({ limit: '8kb' }))
  router.post('/session', async (req, res) => {
    const { username, password } = req.body || {}
    if (typeof username !== 'string' || !username.trim() || username.length > 256 || typeof password !== 'string' || !password || password.length > 4096) return res.status(400).json({ error: 'Enter your File Browser username and password.' })
    try {
      const response = await upstream('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, recaptcha: '' }) })
      if (!response.ok) return res.status(response.status === 401 || response.status === 403 ? 401 : 502).json({ error: response.status === 401 || response.status === 403 ? 'Sign-in failed. Check your File Browser username and password.' : 'File Browser could not sign you in. Try the full File Browser app.' })
      const token = (await response.text()).trim()
      const timing = tokenTiming(token)
      const previousId = sessionId(req)
      if (sessions.size >= 256) sessions.delete(sessions.keys().next().value)
      const id = randomBytes(32).toString('hex')
      sessions.set(id, { token, username, expires: now() + TTL, ...timing })
      sessions.delete(previousId)
      persist()
      res.cookie(COOKIE, id, cookieOptions(req)).json({ username })
    } catch { res.status(502).json({ error: 'Cannot reach File Browser. Check the service connection and try again.' }) }
  })
  router.delete('/session', (req, res) => {
    removeSession(sessionId(req))
    res.clearCookie(COOKIE, { path: '/files-api', httpOnly: true, sameSite: 'strict' }).json({ success: true })
  })
  router.use(async (req, res, next) => {
    const id = sessionId(req)
    req.filesSession = sessions.get(id)
    if (!req.filesSession) return res.status(401).json({ error: 'Sign in to File Browser to browse your files.' })
    try {
      if (req.filesSession.renewAt <= now()) await renew(id, req.filesSession)
      next()
    } catch (error) { res.status(error.status || 502).json({ error: error.message }) }
  })
  router.get('/session', (req, res) => res.json({ username: req.filesSession.username }))
  const resolvePath = req => {
    const value = req.query.path ?? '/'
    if (typeof value !== 'string' || !value.startsWith('/') || value.length > 4096 || value.includes('\0') || value.includes('\\') || value.split('/').some(segment => segment === '..' || segment === '.')) return null
    return value.split('/').map(segment => encodeURIComponent(segment)).join('/')
  }
  const read = async (req, res, kind) => {
    const encoded = resolvePath(req)
    if (encoded === null) return res.status(400).json({ error: 'Invalid file path. Choose a folder in the browser.' })
    try {
      const response = await upstream(`${kind === 'resources' ? 'resources' : 'raw'}${encoded}`, { headers: { 'X-Auth': req.filesSession.token, ...(kind === 'raw' && req.get('Range') ? { Range: req.get('Range') } : {}) } })
      if (!response.ok) {
        if (response.status === 401) removeSession(sessionId(req))
        return res.status([401, 403, 404, 416].includes(response.status) ? response.status : 502).json({ error: response.status === 403 ? 'Your File Browser account cannot access this folder. Choose another folder or ask the administrator for access.' : response.status === 401 ? 'Your session expired. Sign in to File Browser again.' : response.status === 404 ? 'This file or folder no longer exists. Open the parent folder and refresh.' : 'File Browser could not read this file. Refresh and try again.' })
      }
      if (kind === 'resources') {
        const data = await response.json()
        if (!data || typeof data !== 'object' || (data.isDir && !Array.isArray(data.items))) throw new Error('Invalid listing')
        return res.json(data)
      }
      if (kind === 'text') {
        const allowed = /\.(txt|md|json|yaml|yml|toml|ini|conf|log|csv|srt|lrc|nfo|js|jsx|ts|tsx|css|html|xml|sh|py|env)$/i.test(req.query.path)
        if (!allowed) { await response.body?.cancel(); return res.status(415).json({ error: 'Text preview is unavailable for this file. Download it to open it.' }) }
        const reader = response.body.getReader()
        const chunks = []; let bytes = 0; let truncated = false
        try { while (true) { const { done, value } = await reader.read(); if (done) break; const keep = Math.min(value.length, 128 * 1024 - bytes); chunks.push(Buffer.from(value.subarray(0, keep))); bytes += keep; if (bytes >= 128 * 1024) { truncated = true; await reader.cancel(); break } } } finally { reader.releaseLock() }
        return res.json({ text: Buffer.concat(chunks).toString('utf8'), truncated })
      }
      const extension = path.extname(req.query.path || '').toLowerCase()
      const inlineType = imageTypes[extension] || mediaTypes[extension]
      const inline = req.query.inline === '1' && inlineType
      res.status(response.status).set('Content-Type', inline ? inlineType : 'application/octet-stream')
      res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(req.query.path || 'download'))}`)
      for (const header of ['content-length', 'content-range', 'accept-ranges']) if (response.headers.has(header)) res.set(header, response.headers.get(header))
      const stream = Readable.fromWeb(response.body)
      res.on('close', () => stream.destroy())
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    } catch { if (!res.headersSent) res.status(502).json({ error: 'Cannot reach File Browser. Check the service connection and try again.' }) }
  }
  router.get('/resources', (req, res) => read(req, res, 'resources'))
  router.get('/raw', (req, res) => read(req, res, 'raw'))
  router.get('/text', (req, res) => read(req, res, 'text'))
  router.use((_req, res) => res.status(404).json({ error: 'This file operation is not available in the dashboard. Use the full File Browser app.' }))
  router.use((error, _req, res, next) => { void next; res.status(error.status || 500).json({ error: 'Invalid File Browser request. Check your input and try again.' }) })
  return router
}
