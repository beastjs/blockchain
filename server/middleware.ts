import type { IncomingMessage, ServerResponse } from 'node:http'
import { createMarketHandler } from './market'

export function marketMiddleware() {
  const handle = createMarketHandler()
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/market') return next()
    void handle(new Request(new URL(request.url, 'http://localhost'), { method: request.method })).then(result => {
      response.statusCode = result.status
      result.headers.forEach((value, key) => response.setHeader(key, value))
      return result.text()
    }).then(body => response.end(body)).catch(() => {
      response.statusCode = 502
      response.end(JSON.stringify({ error: 'Market prices are temporarily unavailable.' }))
    })
  }
}
