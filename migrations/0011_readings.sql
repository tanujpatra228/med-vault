-- Home readings: blood pressure and blood sugar measured at home (see shared/readings.ts).
CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- bp | sugar
  taken_at TEXT NOT NULL,             -- local time, "2026-10-17T08:30"
  systolic INTEGER,                   -- mmHg
  diastolic INTEGER,
  pulse INTEGER,                      -- beats per minute
  sugar REAL,                         -- mg/dL
  context TEXT,                       -- fasting | after_meal | random (sugar)
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_readings_member ON readings (member_id, taken_at);
CREATE INDEX idx_readings_vault ON readings (vault_id);
