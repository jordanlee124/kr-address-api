import type { Context } from 'hono'
import type { Env } from '../index'
import { insertApiKey } from '../middleware/auth'

export async function signupHandler(c: Context<{ Bindings: Env }>) {
  let email: string | undefined
  try {
    const body = await c.req.json<{ email?: string }>()
    email = body.email?.trim().toLowerCase()
  } catch {
    return c.json({ error: 'Request body must be JSON with an email field.' }, 400)
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'A valid email address is required.' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM api_keys WHERE owner_email = ?'
  ).bind(email).first<{ id: string }>()

  if (existing) {
    return c.json({ error: 'An API key already exists for this email. Contact support if you need to retrieve it.' }, 409)
  }

  const apiKey = await insertApiKey(c.env.DB, email)

  return c.json({
    apiKey,
    email,
    plan: 'free',
    dailyLimit: 200,
    message: 'Store this key — it will not be shown again.',
  }, 201)
}
