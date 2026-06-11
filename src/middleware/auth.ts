import type { MiddlewareHandler } from 'hono'
import type { Env } from '../index'

async function hashKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const apiKey = c.req.header('X-API-Key') ?? c.req.query('api_key')
  if (!apiKey) return c.json({ error: 'Missing API key.' }, 401)

  const keyHash = await hashKey(apiKey)

  const cacheKey = `key:${keyHash}`
  const cached = await c.env.CACHE_KV.get(cacheKey)

  let row: { id: string; plan_id: string; is_active: number } | null = null

  if (cached) {
    row = JSON.parse(cached)
  } else {
    const result = await c.env.DB.prepare(
      'SELECT id, plan_id, is_active FROM api_keys WHERE key_hash = ?'
    )
      .bind(keyHash)
      .first<{ id: string; plan_id: string; is_active: number }>()

    if (result) {
      await c.env.CACHE_KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 })
      row = result
    }
  }

  if (!row) return c.json({ error: 'Invalid API key.' }, 401)
  if (!row.is_active) return c.json({ error: 'API key is inactive.' }, 403)

  c.set('keyId' as never, row.id)
  c.set('planId' as never, row.plan_id)

  await c.env.DB.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?')
    .bind(row.id)
    .run()

  return next()
}

export async function insertApiKey(
  db: D1Database,
  email: string,
  planId = 'free',
  subscriptionId?: string
): Promise<string> {
  const rawKey = crypto.randomUUID().replace(/-/g, '')
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey))
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  await db.prepare(
    'INSERT INTO api_keys (key_hash, owner_email, plan_id, polar_subscription_id) VALUES (?, ?, ?, ?)'
  ).bind(keyHash, email, planId, subscriptionId ?? null).run()

  return rawKey
}
