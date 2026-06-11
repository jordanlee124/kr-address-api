import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { normalizeHandler } from './handlers/normalize'
import { searchHandler } from './handlers/search'

export type Env = {
  JUSO_CONFIRM_KEY: string
  POLAR_WEBHOOK_SECRET: string
  DB: D1Database
  CACHE_KV: KVNamespace
  RATE_LIMIT_KV: KVNamespace
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())
app.use('/v1/*', authMiddleware)
app.use('/v1/*', rateLimitMiddleware)

app.get('/v1/normalize', normalizeHandler)
app.get('/v1/search', searchHandler)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

export default app
