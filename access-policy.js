import { BlockList, isIP } from 'node:net'

const tailnet = new BlockList()
tailnet.addSubnet('100.64.0.0', 10, 'ipv4')
tailnet.addSubnet('fd7a:115c:a1e0::', 48, 'ipv6')
const normalize = ip => ip?.startsWith('::ffff:') ? ip.slice(7) : ip
const loopback = ip => ip === '::1' || /^127\./.test(ip || '')

// Only the local reverse proxy may assert the original client address.
// Caddy appends/sets the immediate client as the last X-Forwarded-For hop.
export function createAccessPolicy({ origins = process.env.DASHBOARD_ORIGINS || 'http://127.0.0.1:3080,http://localhost:3080' } = {}) {
  const allowed = new Set(origins.split(',').map(value => new URL(value.trim()).origin))
  const hosts = new Set([...allowed].map(value => new URL(value).host))
  const permits = (req, requireOrigin = false) => {
    const peer = normalize(req.socket.remoteAddress)
    if (!loopback(peer)) return false
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      const client = normalize(forwarded.split(',').at(-1).trim())
      const family = isIP(client)
      if (!family || !tailnet.check(client, family === 4 ? 'ipv4' : 'ipv6')) return false
    }
    if (!hosts.has(req.headers.host)) return false
    const origin = req.headers.origin
    if (requireOrigin && !origin) return false
    if (origin && !allowed.has(origin)) return false
    return req.headers['sec-fetch-site'] !== 'cross-site'
  }
  return {
    permits,
    middleware(req, res, next) {
      if (!permits(req)) return res.status(403).json({ error: 'Open the dashboard through its private Tailscale address.' })
      res.set('X-Content-Type-Options', 'nosniff')
      res.set('Referrer-Policy', 'same-origin')
      res.set('X-Frame-Options', 'DENY')
      next()
    },
  }
}
