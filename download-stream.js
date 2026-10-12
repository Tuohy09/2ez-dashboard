import { Readable } from 'node:stream'

// The deadline covers headers and each pending read, not the full download.
// Waiting for a slow browser to drain buffered data does not expire the upstream.
export async function openDownload(url, { fetcher = fetch, headers, client, timeoutMs = 30000 } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  client.once('close', abort)
  let timer = setTimeout(abort, timeoutMs)
  const cleanup = () => { clearTimeout(timer); client.off('close', abort) }
  try {
    const response = await fetcher(url, { headers, signal: controller.signal, redirect: 'error' })
    clearTimeout(timer)
    let used = false
    return {
      response,
      async cancel() { cleanup(); controller.abort(); await response.body?.cancel().catch(() => {}) },
      stream() {
        if (used) throw new Error('Download stream already consumed')
        used = true
        return Readable.from((async function* () {
          const reader = response.body.getReader()
          try {
            while (true) {
              timer = setTimeout(abort, timeoutMs)
              let item
              try { item = await reader.read() } finally { clearTimeout(timer) }
              if (item.done) break
              yield Buffer.from(item.value)
            }
          } finally {
            cleanup(); controller.abort()
            await reader.cancel().catch(() => {})
            reader.releaseLock()
          }
        })())
      },
    }
  } catch (error) { cleanup(); controller.abort(); throw error }
}
