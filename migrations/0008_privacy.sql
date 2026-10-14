-- Privacy and consent (see docs/COMPLIANCE.md).
ALTER TABLE vaults ADD COLUMN consent_version INTEGER;   -- privacy notice version agreed to (null = never)
ALTER TABLE vaults ADD COLUMN consent_at TEXT;
ALTER TABLE vaults ADD COLUMN ai_consent_at TEXT;        -- set while AI reading of photos is allowed
ALTER TABLE vaults ADD COLUMN contact_email TEXT;        -- optional, only for security notices
