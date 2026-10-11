-- Med Vault initial schema. Dates are ISO 'YYYY-MM-DD'; timestamps are ISO-8601 UTC.

CREATE TABLE members (
  id TEXT PRIMARY KEY,
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
CREATE INDEX idx_allergies_member ON allergies(member_id);

CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
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
  member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_files_owner ON files(owner_type, owner_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip, attempted_at);
