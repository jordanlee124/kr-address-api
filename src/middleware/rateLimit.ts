import type { MiddlewareHandler } from 'hono'
import type { Env } from '../index'

const PLAN_LIMITS: Record<string, number> = {
  free: 200,
  starter: 2000,
  pro: 10000,
  business: 100000,
}

export const rateLimitMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const keyId = c.get('keyId' as never) as string
  const planId = (c.get('planId' as never) as string) ?? 'free'
  const limit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const rateLimitKey = `rate:${keyId}:${today}`

  const current = await c.env.RATE_LIMIT_KV.get(rateLimitKey)
  const count = current ? parseInt(current) : 0

  if (count >= limit) {
    const resetTimestamp = Math.floor(
      new Date(`${today}T00:00:00Z`).getTime() / 1000 + 86400
    )
    return c.json({ error: 'Daily rate limit exceeded.' }, 429, {
      'X-RateLimit-Limit': String(limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(resetTimestamp),
    })
  }

  await c.env.RATE_LIMIT_KV.put(rateLimitKey, String(count + 1), { expirationTtl: 86400 })

  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(limit - count - 1))

  return next()
}
