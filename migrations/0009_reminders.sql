-- Reminders by Web Push (see docs/REMINDERS.md).

-- One row per phone that turned reminders on. Removing the device removes its reminders.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  prefs TEXT NOT NULL,                        -- ReminderPrefs JSON
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_sent_at TEXT
);
CREATE INDEX idx_push_vault ON push_subscriptions(vault_id);

-- What was already sent, so each reminder goes out once (kept 3 days).
CREATE TABLE reminder_log (
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (subscription_id, key)
);

-- Server-generated keys (the VAPID key pair for Web Push).
CREATE TABLE app_keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- For the monthly "time for a backup" nudge.
ALTER TABLE vaults ADD COLUMN last_export_at TEXT;
