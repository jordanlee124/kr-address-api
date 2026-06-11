import type { Env } from '../index'

export async function getCached<T>(env: Env, key: string): Promise<T | null> {
  const value = await env.CACHE_KV.get(key)
  return value ? JSON.parse(value) as T : null
}

export async function setCached(env: Env, key: string, value: unknown, ttl: number) {
  await env.CACHE_KV.put(key, JSON.stringify(value), { expirationTtl: ttl })
}
