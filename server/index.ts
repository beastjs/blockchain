import { resolve, sep } from 'node:path'
import { createMarketHandler } from './market'
import { createTimelineHandler } from './timeline'

const handleMarket = createMarketHandler()
const handleTimeline = createTimelineHandler()
const root = resolve(import.meta.dir, '../dist')
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/timeline') return handleTimeline(request)
    if (url.pathname.startsWith('/api/')) return handleMarket(request)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    let path: string
    try { path = resolve(root, `.${decodeURIComponent(url.pathname)}`) } catch { return new Response('Invalid path', { status: 400 }) }
    if (path !== root && !path.startsWith(root + sep)) return new Response('Not found', { status: 404 })
    const file = Bun.file(path === root ? resolve(root, 'index.html') : path)
    if (await file.exists()) return new Response(request.method === 'HEAD' ? null : file, { headers: { 'content-type': file.type } })
    if (url.pathname.includes('.')) return new Response('Not found', { status: 404 })
    return new Response(request.method === 'HEAD' ? null : Bun.file(resolve(root, 'index.html')), { headers: { 'content-type': 'text/html' } })
  },
})
console.log(`BLOCK running at ${server.url}`)
