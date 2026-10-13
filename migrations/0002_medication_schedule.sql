-- Structured dosage schedule (JSON, see shared/schedule.ts). The text `dosage` column stays as a
-- human-readable summary; old rows without a schedule are read from `dosage` by scheduleOf().
ALTER TABLE medications ADD COLUMN schedule TEXT;
