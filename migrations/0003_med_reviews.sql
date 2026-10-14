-- "Ask your doctor": the latest medicine review per member (see docs/ASK_YOUR_DOCTOR.md).
-- result = MedReview JSON. Kept so a review is not re-run (and AI not re-spent) until medicines change.
CREATE TABLE med_reviews (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_med_reviews_vault ON med_reviews(vault_id);
