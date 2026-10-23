-- Security log (DPDP Rule 6): which phone did what, and when. See docs/AUDIT_LOG.md.
-- Kept for one year, also after the vault is deleted, so there is no foreign key to vaults on purpose.
-- Holds no medical content: record types and ids only, never a medicine name or a result.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  vault_id TEXT NOT NULL,
  device_id TEXT,                     -- null for events without a signed-in phone
  device_name TEXT,                   -- copied, because the device row goes when it is unlinked
  client TEXT,                        -- Android | iPhone | Windows | Mac | Other (from the user agent)
  country TEXT,                       -- two-letter country of the request (Cloudflare); no IP address
  action TEXT NOT NULL,               -- e.g. record.create, device.link, backup.export (shared/audit.ts)
  record_type TEXT,                   -- member | medication | report ...
  record_id TEXT,
  member_id TEXT,
  detail TEXT                         -- small JSON with non-medical facts (changed field names, scan kind)
);
CREATE INDEX idx_audit_vault ON audit_log (vault_id, at);
CREATE INDEX idx_audit_at ON audit_log (at);
