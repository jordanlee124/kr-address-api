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
