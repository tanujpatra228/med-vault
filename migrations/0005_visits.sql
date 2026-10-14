-- Visits log and follow-ups (see docs/VISITS.md).
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
  prescription_id TEXT REFERENCES prescriptions(id) ON DELETE SET NULL,  -- the prescription written at this visit
  visit_date TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  follow_up_on TEXT,                          -- next visit the doctor asked for
  follow_up_note TEXT,                        -- e.g. "Bring CBC and LFT reports"
  follow_up_done INTEGER NOT NULL DEFAULT 0,  -- 1 once the next visit is logged or the follow-up is dismissed
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_visits_member ON visits(member_id, visit_date DESC);
CREATE INDEX idx_visits_follow_up ON visits(vault_id, follow_up_done, follow_up_on);

-- Every prescription so far was written at a visit.
INSERT INTO visits (id, vault_id, member_id, doctor_id, condition_id, prescription_id, visit_date, created_at, updated_at)
SELECT lower(hex(randomblob(16))), vault_id, member_id, doctor_id, condition_id, id, prescribed_on, created_at, updated_at FROM prescriptions;
