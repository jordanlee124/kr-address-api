import type { Context } from 'hono'
import type { Env } from '../index'

export async function cancelHandler(c: Context<{ Bindings: Env }>) {
  const keyId = c.get('keyId' as never) as string

  const row = await c.env.DB.prepare(
    'SELECT polar_subscription_id, plan_id FROM api_keys WHERE id = ?'
  ).bind(keyId).first<{ polar_subscription_id: string | null; plan_id: string }>()

  if (!row) return c.json({ error: 'Key not found.' }, 404)

  if (row.plan_id === 'free' || !row.polar_subscription_id) {
    return c.json({ error: 'No active paid subscription found.' }, 400)
  }

  const res = await fetch(`https://api.polar.sh/v1/subscriptions/${row.polar_subscription_id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${c.env.POLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return c.json({ error: 'Failed to cancel subscription.', detail: body }, 502)
  }

  return c.json({
    message: 'Subscription cancelled. Your current plan remains active until the end of the billing period.',
  })
}
