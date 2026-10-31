// Loopback-only preview of the production build and Vercel-style RPC handler.
import { resolve, sep } from 'node:path'
import handler from '../api/arc-mainnet.mjs'
const root = resolve('dist')
Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PREVIEW_PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/arc-mainnet') {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      let status = 200, body
      const response = {
        setHeader(k, v) { headers.set(k, v) },
        status(v) { status = v; return response },
        json(v) { body = JSON.stringify(v); return response },
      }
      // Bound request bodies before handing them to the gateway.
      let raw = ''
      if (request.body) {
        const reader = request.body.getReader()
        const chunks = []; let bytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 65536) { await reader.cancel(); return new Response('Request too large', { status: 413 }) }
          chunks.push(value)
        }
        raw = await new Blob(chunks).text()
      }
      await handler({ method: request.method, headers: Object.fromEntries(request.headers), body: raw }, response)
      return new Response(body, { status, headers })
    }
    let path
    try { path = resolve(root, '.' + decodeURIComponent(url.pathname)) }
    catch { return new Response('Bad path', { status: 400 }) }
    if (path !== root && !path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 })
    const file = Bun.file(path)
    const exists = path !== root && await file.exists()
    if (!exists && url.pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 })
    return new Response(exists ? file : Bun.file(resolve(root, 'index.html')), { headers: { 'Cache-Control': 'no-store' } })
  },
})
console.log('Local Mainnet frontend: http://127.0.0.1:' + (process.env.PREVIEW_PORT ?? 4173))
