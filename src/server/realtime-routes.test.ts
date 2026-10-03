import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { AppContext } from '../../worker'
import { registerRealtimeRoutes } from './realtime-routes'

describe('private realtime authentication', () => {
  const app = new Hono<AppContext>()
  registerRealtimeRoutes(app)

  for (const path of ['/ws/private', '/ws/presence/private', '/ws/canvas/private', '/ws/cron/private', '/ws/jobs/private', '/ws/yjs/private']) {
    for (const query of ['', '?userId=forged&role=admin', '?token=invalid']) {
      it(`rejects ${path}${query} before accessing a room`, async () => {
        // No room bindings are supplied: reaching a Durable Object would fail.
        // Exercise the actual route and JWT verifier, without mocking either.
        const response = await app.request(`https://spendsense.test${path}${query}`, {}, {})
        expect(response.status).toBe(401)
        expect(await response.text()).toBe('Unauthorized')
      })
    }
  }
})
