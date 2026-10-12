import httpProxy from 'http-proxy'

// Fixed upstream and mount paths; no user-controlled routing or glob matching.
export function createUpstreamProxy(target, prefix = '') {
  const proxy = httpProxy.createProxyServer({ target, changeOrigin: true, proxyTimeout: 30000, timeout: 30000 })
  proxy.on('error', (_error, _req, res) => {
    if (res.headersSent) return res.destroy()
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upstream service unavailable.' }))
  })
  return (req, res) => { req.url = prefix + req.url; proxy.web(req, res) }
}
