-- Workers AI usage in neurons (Cloudflare's billing unit), per call. Replaces counting AI calls in
-- rate_events: the same scan can cost 78 or 96 neurons, so limits are a neuron budget per day.
-- See docs/INFRASTRUCTURE.md "Workers AI budget".
CREATE TABLE ai_usage (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                         -- prescription | medicine | report | review
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  neurons REAL NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_ai_usage_vault ON ai_usage(vault_id, at);
CREATE INDEX idx_ai_usage_at ON ai_usage(at);
