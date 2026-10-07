import type { IncomingMessage, ServerResponse } from 'node:http'
import { createMarketHandler } from './market'
import { createTimelineHandler } from './timeline'

export function marketMiddleware() {
  const market = createMarketHandler()
  const timeline = createTimelineHandler()
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0]
    if (path !== '/api/market' && path !== '/api/timeline') return next()
    const handle = path === '/api/timeline' ? timeline : market
    void handle(new Request(new URL(request.url ?? '/', 'http://localhost'), { method: request.method })).then(result => {
      response.statusCode = result.status
      result.headers.forEach((value, key) => response.setHeader(key, value))
      return result.text()
    }).then(body => response.end(body)).catch(() => {
      response.statusCode = 502
      response.end(JSON.stringify({ error: 'Market prices are temporarily unavailable.' }))
    })
  }
}
