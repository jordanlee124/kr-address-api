import type { Context } from 'hono'
import type { Env } from '../index'
import { searchJuso } from '../services/juso'
import { transformJusoResult } from '../services/transform'
import { getCached, setCached } from '../services/cache'

export async function searchHandler(c: Context<{ Bindings: Env }>) {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'Missing query parameter: q' }, 400)
  const limit = Math.min(parseInt(c.req.query('limit') ?? '5'), 10)

  const cacheKey = `search:${q.toLowerCase()}:${limit}`
  const cached = await getCached<object>(c.env, cacheKey)
  if (cached) return c.json({ ...cached, cached: true })

  const rawResults = await searchJuso(q, c.env.JUSO_CONFIRM_KEY, limit)
  const results = rawResults.map(transformJusoResult)

  const response = { query: q, count: results.length, results }
  await setCached(c.env, cacheKey, response, 3600)
  return c.json({ ...response, cached: false })
}
