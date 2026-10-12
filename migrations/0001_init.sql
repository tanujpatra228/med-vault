-- Med Vault initial schema. Dates are ISO 'YYYY-MM-DD'; timestamps are ISO-8601 UTC.

-- A vault holds one family's records. No user accounts: devices hold keys to a vault.
CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,                -- SHA-256 of the recovery key (shown once)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Each linked phone/browser. token_hash = SHA-256 of the device cookie.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_devices_vault ON devices(vault_id);

-- Short-lived one-time codes to link another device to a vault.
CREATE TABLE link_codes (
  code_hash TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Per-IP counters for rate limits (vault creation, failed link/recovery attempts).
CREATE TABLE rate_events (
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_rate_events ON rate_events(ip, kind, at);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT,
  dob TEXT,
  sex TEXT,
  blood_group TEXT,
  notes TEXT,
  photo_file_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT,
  clinic TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE allergies (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'drug',          -- drug | food | other
  reaction TEXT,
  severity TEXT NOT NULL DEFAULT 'moderate',  -- mild | moderate | severe
  noted_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_members_vault ON members(vault_id);
CREATE INDEX idx_doctors_vault ON doctors(vault_id);
CREATE INDEX idx_allergies_member ON allergies(member_id);

CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | resolved
  diagnosed_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_conditions_member ON conditions(member_id);

CREATE TABLE prescriptions (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
  prescribed_on TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_prescriptions_member ON prescriptions(member_id, prescribed_on DESC);

CREATE TABLE medications (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  prescription_id TEXT REFERENCES prescriptions(id) ON DELETE SET NULL,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  strength TEXT,
  form TEXT,                                  -- tablet | capsule | syrup | drops | ointment | injection | other
  dosage TEXT,                                -- e.g. 1-0-1
  timing TEXT,                                -- e.g. after food
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | stopped
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_medications_member ON medications(member_id, status);
CREATE INDEX idx_medications_prescription ON medications(prescription_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  condition_id TEXT REFERENCES conditions(id) ON DELETE SET NULL,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'other',  -- blood | urine | imaging | scan | ecg | other
  report_date TEXT NOT NULL,
  lab_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reports_member ON reports(member_id, report_date DESC);

-- Files live in R2 under key = id. owner_type: member | prescription | report | medication
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_files_owner ON files(owner_type, owner_id);
CREATE INDEX idx_files_vault ON files(vault_id);
