# KR⇔EN Address Normalizer API

A REST API that normalizes Korean address strings into structured data in both Korean and English — road address, jibun address, postal code, and romanized components. Powered by the Korean government's free Juso API (주소기반산업지원서비스).

## Endpoints

- `GET /v1/normalize?q={address}` — best match, structured Korean + English
- `GET /v1/search?q={query}&limit=5` — multiple results
- `GET /health` — health check

**Target:** <80ms cached · <1s uncached

## Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Edge / Auth | Cloudflare Workers | Rate limiting + auth at the edge |
| Framework | Hono + TypeScript | Lightweight, native CF support |
| Cache | Cloudflare KV | 24hr address cache, native binding |
| Data source | Juso API (Korean gov) | Free, official, includes English romanization |
| Database | Cloudflare D1 | API keys, usage logs, plan tiers |
| Billing | Polar | MoR handles global tax compliance |
| Docs | Mintlify | OpenAPI playground |
| Marketplace | RapidAPI | Developer discoverability |

## Project Structure

```
kr-address-api/
├── src/
│   ├── index.ts
│   ├── handlers/
│   │   ├── normalize.ts
│   │   └── search.ts
│   ├── services/
│   │   ├── juso.ts           # Juso API client
│   │   ├── transform.ts      # Response shaping + city mapping
│   │   └── cache.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── rateLimit.ts
│   └── types.ts
├── schema.sql
├── wrangler.toml
└── openapi.yaml
```

## Environment / Secrets

Set via `wrangler secret put`:
- `JUSO_CONFIRM_KEY` — from [business.juso.go.kr](https://business.juso.go.kr) → 도로명주소 개발자센터 → API 신청 (instant approval)
- `POLAR_WEBHOOK_SECRET` — from Polar dashboard → Settings → Webhooks

KV / D1 IDs go in `wrangler.toml` (not secrets):
- `CACHE_KV` — `wrangler kv:namespace create "CACHE_KV"`
- `RATE_LIMIT_KV` — `wrangler kv:namespace create "RATE_LIMIT_KV"`
- `DB` — `wrangler d1 create kr-address-api`

## wrangler.toml shape

```toml
name = "kr-address-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "YOUR_CACHE_KV_ID"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "YOUR_RATE_LIMIT_KV_ID"

[[d1_databases]]
binding = "DB"
database_name = "kr-address-api"
database_id = "YOUR_D1_DATABASE_ID"
```

## Env Type

```typescript
export type Env = {
  JUSO_CONFIRM_KEY: string
  POLAR_WEBHOOK_SECRET: string
  DB: D1Database
  CACHE_KV: KVNamespace
  RATE_LIMIT_KV: KVNamespace
}
```

## Juso API

Base URL: `https://business.juso.go.kr/addrlink/addrLinkApi.do`

Key response fields:
- `roadAddr` — full road address (도로명주소)
- `jibunAddr` — land lot address (지번주소)
- `engAddr` — English romanized address (the core value-add)
- `zipNo` — 5-digit postal code
- `siNm` — city (서울특별시, 부산광역시, etc.)
- `sggNm` — district (강남구, 해운대구, etc.)
- `emdNm` — neighbourhood (역삼동, 서면, etc.)
- `rn` — road name
- `bdNm` — building name
- `buldMnnm` / `buldSlno` — building main/sub number

## Cache TTL Strategy

| Key pattern | TTL | Reason |
|-------------|-----|--------|
| `normalize:{q}` | 86400s (24hr) | Physical addresses are stable |
| `search:{q}:{limit}` | 3600s (1hr) | Search results can vary by ordering |
| `key:{hash}` | 300s (5min) | API key freshness |
| `rate:{keyId}:{date}` | 86400s | Daily counter |

## Rate Limit Plans

| Plan | Daily limit | Price |
|------|-------------|-------|
| Free | 200 | $0 |
| Starter | 2,000 | $19/mo |
| Pro | 10,000 | $49/mo |
| Business | 100,000 | $149/mo |

Rate limit KV key: `rate:{keyId}:{YYYY-MM-DD}` (UTC). Return 429 with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

## Auth

- Accept `X-API-Key` header or `api_key` query param
- SHA-256 hash the key, look up in D1 `api_keys` table
- Return 401 if missing, 403 if inactive/invalid
- Set `keyId` + `planId` on Hono context for downstream use

## Database Schema (schema.sql)

```sql
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  daily_limit INTEGER NOT NULL,
  polar_product_id TEXT,
  price_usd INTEGER
);

INSERT OR IGNORE INTO plans VALUES
  ('free',     'Free',      200,    NULL, 0),
  ('starter',  'Starter',   2000,   NULL, 19),
  ('pro',      'Pro',       10000,  NULL, 49),
  ('business', 'Business',  100000, NULL, 149);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  key_hash TEXT UNIQUE NOT NULL,
  owner_email TEXT NOT NULL,
  plan_id TEXT REFERENCES plans(id) DEFAULT 'free',
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT REFERENCES api_keys(id),
  query_hash TEXT,
  endpoint TEXT,
  was_cached INTEGER DEFAULT 0,
  response_ms INTEGER,
  result_count INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_key_day ON usage_logs (key_id, created_at);
```

Apply: `wrangler d1 execute kr-address-api --file=./schema.sql`

## Polar Billing Webhook

Route: `POST /webhooks/polar`

- Verify HMAC-SHA256 signature against `POLAR_WEBHOOK_SECRET`; return 400 on failure
- `subscription.updated` — look up plan by `polar_product_id` in D1, update `api_keys`
- `subscription.revoked` — reset `plan_id` to `free`

Register in Polar Dashboard → Settings → Webhooks → Add endpoint. Events: `subscription.updated`, `subscription.revoked`.

## CITY_MAP (all 17 administrative divisions)

```typescript
export const CITY_MAP: Record<string, string> = {
  '서울특별시': 'Seoul', '부산광역시': 'Busan',
  '인천광역시': 'Incheon', '대구광역시': 'Daegu',
  '대전광역시': 'Daejeon', '광주광역시': 'Gwangju',
  '울산광역시': 'Ulsan', '세종특별자치시': 'Sejong',
  '경기도': 'Gyeonggi-do', '강원특별자치도': 'Gangwon-do',
  '충청북도': 'Chungcheongbuk-do', '충청남도': 'Chungcheongnam-do',
  '전라도': 'Jeolla-do', '전라북도': 'Jeollabuk-do',
  '전라남도': 'Jeollanam-do', '경상북도': 'Gyeongsangbuk-do',
  '경상남도': 'Gyeongsangnam-do', '제주특별자치도': 'Jeju-do',
}
```

## Common Commands

```bash
# Install
npm create cloudflare@latest kr-address-api
npm install hono
npm install -D wrangler

# Infrastructure setup
wrangler kv:namespace create "CACHE_KV"
wrangler kv:namespace create "RATE_LIMIT_KV"
wrangler d1 create kr-address-api
wrangler d1 execute kr-address-api --file=./schema.sql

# Secrets
wrangler secret put JUSO_CONFIRM_KEY
wrangler secret put POLAR_WEBHOOK_SECRET

# Deploy
npx wrangler deploy
```

## Smoke Tests

```bash
WORKER=https://kr-address-api.YOUR_SUBDOMAIN.workers.dev
KEY=your_test_key

# Normalize - Gyeongbokgung Palace
curl "$WORKER/v1/normalize?q=%EA%B2%BD%EB%B3%B5%EA%B6%81" -H "X-API-Key: $KEY"
# Expect: roadAddress contains 종로구, englishAddress contains "Sajik-ro", cached: false

# Second request -> cached: true
curl "$WORKER/v1/normalize?q=%EA%B2%BD%EB%B3%B5%EA%B6%81" -H "X-API-Key: $KEY"

# Search
curl "$WORKER/v1/search?q=%EA%B0%95%EB%82%A8%EA%B5%AC+%ED%85%8C%ED%97%A4%EB%9E%80%EB%A1%9C&limit=3" -H "X-API-Key: $KEY"
# Expect: count >= 1, results[0].englishAddress contains "Teheran-ro"

# Error cases
curl "$WORKER/v1/normalize"             # -> 400
curl "$WORKER/v1/normalize?q=경복궁"    # (no key) -> 401
```

## Go-Live Checklist

- [ ] `JUSO_CONFIRM_KEY` secret set
- [ ] `POLAR_WEBHOOK_SECRET` secret set
- [ ] D1 schema deployed and plans seeded ($19/$49/$149 price points)
- [ ] `CACHE_KV` and `RATE_LIMIT_KV` IDs in wrangler.toml
- [ ] Free-tier test key inserted into D1
- [ ] Polar products created and product IDs stored in D1
- [ ] Polar webhook registered
- [ ] Worker deployed
- [ ] `/normalize?q=경복궁` returns Seoul address with English romanization
- [ ] Same request returns `cached: true`
- [ ] `/search?q=강남구&limit=3` returns multiple results
- [ ] Missing `q` returns 400
- [ ] Missing API key returns 401
- [ ] Mintlify docs live
- [ ] RapidAPI listing submitted

## Cost

| Service | Free tier | Paid |
|---------|-----------|------|
| Cloudflare Workers + KV + D1 | 100k req/day | $5/mo |
| Polar | No monthly fee | 4% + 40c/transaction |
| Juso API (Korean gov) | Free, unlimited | Free |
| Mintlify | Free | Free |
| RapidAPI | Free to list | Revenue share |

Break-even: 3 Starter subscribers ($57/mo) covers Cloudflare.
