-- A prescription, medicine, report or visit can be for several conditions (e.g. arthritis and the
-- eye inflammation it causes). The single condition_id column stays as the first link, for
-- compatibility; record_conditions holds them all.
CREATE TABLE record_conditions (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,                   -- prescription | medication | report | visit
  owner_id TEXT NOT NULL,
  condition_id TEXT NOT NULL REFERENCES conditions(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_type, owner_id, condition_id)
);
CREATE INDEX idx_record_conditions_condition ON record_conditions(condition_id);

INSERT INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
  SELECT vault_id, 'prescription', id, condition_id FROM prescriptions WHERE condition_id IS NOT NULL;
INSERT INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
  SELECT vault_id, 'medication', id, condition_id FROM medications WHERE condition_id IS NOT NULL;
INSERT INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
  SELECT vault_id, 'report', id, condition_id FROM reports WHERE condition_id IS NOT NULL;
INSERT INTO record_conditions (vault_id, owner_type, owner_id, condition_id)
  SELECT vault_id, 'visit', id, condition_id FROM visits WHERE condition_id IS NOT NULL;
