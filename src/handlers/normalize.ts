import type { Context } from 'hono'
import type { Env } from '../index'
import { searchJuso } from '../services/juso'
import { transformJusoResult } from '../services/transform'
import { getCached, setCached } from '../services/cache'

export async function normalizeHandler(c: Context<{ Bindings: Env }>) {
  const q = c.req.query('q')?.trim()
  if (!q || q.length < 3) return c.json({ error: 'q must be at least 3 characters.' }, 400)

  const cacheKey = `normalize:${q.toLowerCase()}`
  const cached = await getCached<object>(c.env, cacheKey)
  if (cached) return c.json({ ...cached, cached: true })

  const results = await searchJuso(q, c.env.JUSO_CONFIRM_KEY, 1)
  if (!results.length) return c.json({ error: 'Address not found.' }, 404)

  const result = transformJusoResult(results[0])
  await setCached(c.env, cacheKey, { query: q, result }, 86400)
  return c.json({ query: q, result, cached: false })
}
