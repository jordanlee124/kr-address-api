import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { rateLimitMiddleware } from './middleware/rateLimit'
import { normalizeHandler } from './handlers/normalize'
import { searchHandler } from './handlers/search'
import { signupHandler } from './handlers/signup'
import { cancelHandler } from './handlers/cancel'
import { insertApiKey } from './middleware/auth'

export type Env = {
  JUSO_CONFIRM_KEY: string
  POLAR_WEBHOOK_SECRET: string
  POLAR_API_KEY: string
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
app.post('/signup', signupHandler)
app.use('/cancel', authMiddleware)
app.post('/cancel', cancelHandler)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.post('/webhooks/polar', async (c) => {
  const signature = c.req.header('webhook-signature')
  if (!signature) return c.json({ error: 'Missing signature.' }, 400)

  const body = await c.req.text()

  // Verify HMAC-SHA256 signature
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(c.env.POLAR_WEBHOOK_SECRET.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  // Polar sends signature as "v1=<hex_digest>"
  const sigParts = signature.split(',').map((s: string) => s.trim())
  const v1Part = sigParts.find((s: string) => s.startsWith('v1='))
  if (!v1Part) return c.json({ error: 'Invalid signature format.' }, 400)

  const sigHex = v1Part.slice(3)
  const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)))

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body))
  if (!valid) return c.json({ error: 'Invalid signature.' }, 400)

  const event = JSON.parse(body) as { type: string; data: { product_id?: string; customer?: { email?: string }; subscription_id?: string } }

  if (event.type === 'subscription.updated') {
    const plan = await c.env.DB.prepare(
      'SELECT id FROM plans WHERE polar_product_id = ?'
    ).bind(event.data.product_id).first<{ id: string }>()

    if (plan && event.data.customer?.email) {
      const email = event.data.customer.email
      const existing = await c.env.DB.prepare(
        'SELECT id FROM api_keys WHERE owner_email = ?'
      ).bind(email).first<{ id: string }>()

      if (existing) {
        await c.env.DB.prepare(
          'UPDATE api_keys SET plan_id = ?, polar_subscription_id = ? WHERE owner_email = ?'
        ).bind(plan.id, event.data.subscription_id ?? null, email).run()
      } else {
        // New paid subscriber — create key directly on the paid plan
        await insertApiKey(c.env.DB, email, plan.id, event.data.subscription_id)
      }
    }
  }

  if (event.type === 'subscription.revoked') {
    if (event.data.customer?.email) {
      await c.env.DB.prepare(
        'UPDATE api_keys SET plan_id = \'free\', polar_subscription_id = NULL WHERE owner_email = ?'
      ).bind(event.data.customer.email).run()
    }
  }

  return c.json({ received: true })
})

export default app
