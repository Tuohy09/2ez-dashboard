export function attachTerminal({ httpServer, WebSocketServer, pty, shell, permits, maxSessions = 4 }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false })
  const upgrade = (req, socket, head) => {
    const reject = status => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    if (req.url !== '/terminal') return reject('404 Not Found')
    if (!permits(req, true)) return reject('403 Forbidden')
    if (wss.clients.size >= maxSessions) return reject('429 Too Many Requests')
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  }
  httpServer.on('upgrade', upgrade)
  wss.on('connection', ws => {
    let term
    try { term = pty.spawn(shell.file, shell.args, { name: 'xterm-color', cols: 80, rows: 24, cwd: shell.cwd, env: shell.env }) }
    catch { ws.close(1011, 'Shell unavailable'); return }
    let killed = false
    const kill = () => { if (!killed) { killed = true; try { term.kill() } catch { /* already exited */ } } }
    term.onData(data => {
      if (ws.bufferedAmount > 1024 * 1024) { ws.terminate(); return }
      if (ws.readyState === ws.OPEN) ws.send(data)
    })
    term.onExit(() => ws.close())
    ws.on('message', raw => {
      let message
      try { message = JSON.parse(raw.toString()) } catch { return }
      if (!message || typeof message !== 'object') return
      if (message.type === 'input' && typeof message.data === 'string') term.write(message.data)
      else if (message.type === 'resize' && Number.isInteger(message.cols) && Number.isInteger(message.rows) && message.cols > 0 && message.rows > 0 && message.cols <= 500 && message.rows <= 300) {
        try { term.resize(message.cols, message.rows) } catch { /* shell exited */ }
      }
    })
    let alive = true
    ws.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping() }, 30000)
    heartbeat.unref()
    ws.on('close', () => { clearInterval(heartbeat); kill() })
    ws.on('error', kill)
  })
  httpServer.on('close', () => { for (const ws of wss.clients) ws.terminate(); wss.close() })
  return wss
}
