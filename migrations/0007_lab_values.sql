-- Lab trends: one row per test result on a report (see docs/LAB_TRENDS.md). The date is the
-- report's date (joined, so editing the report date moves its values too).
CREATE TABLE lab_values (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  test_key TEXT NOT NULL,                     -- canonical test ("esr", "crp", or "x:<name>")
  test_name TEXT NOT NULL,                    -- as printed on the report
  value REAL,                                 -- numeric result, when there is one
  value_text TEXT,                            -- result as printed ("42", "<0.5", "Negative")
  unit TEXT,
  ref_low REAL,
  ref_high REAL,
  ref_text TEXT,                              -- normal range as printed
  flag TEXT,                                  -- high | low | null
  position INTEGER NOT NULL DEFAULT 0,        -- order on the report
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_lab_values_member ON lab_values(member_id, test_key);
CREATE INDEX idx_lab_values_report ON lab_values(report_id);
