# Audit log (security log)

Status: **built**. Code: `worker/audit.ts` (what is logged, the purge), `shared/audit.ts` (actions, plain-word descriptions), `migrations/0012_audit_log.sql`, `src/pages/Activity.tsx` (Settings → Activity), activity endpoint in `worker/vault.ts`.

## Decisions

| Question | Decision |
|---|---|
| Retention | **One year** (`AUDIT_DAYS = 365`), rolling. The cron deletes older entries once a day (03:00 UTC). Meets DPDP Rules 2025, Rule 6. |
| After the vault is deleted | **Option A: kept for the rest of its year.** No foreign key to `vaults`, so deleting a vault does not delete its log. The entries hold no medical content, and their record ids point to nothing once the vault is gone. |
| What is logged | Every change (add, edit, delete), sign-in events, link codes, recovery key changes, backups and restores, AI use, consent changes, reminders set up or turned off. |
| What is not logged | Opening or viewing a record. Prefetch loads records nobody opened, so a view log would be noise. Failed join attempts are already counted per IP in `rate_events` (kept 2 days) and cannot be tied to a vault. |
| What an entry holds | Time, vault, phone id and name (copied, since a removed phone's row is deleted), kind of phone (Android, iPhone, Windows, Mac, Other), country of the request, action, record type and id, member id, and for edits the **names** of the changed fields. |
| What an entry never holds | Values: no medicine names, doses, results, notes or photos. No IP address. |
| Who can see it | The family: Settings → Activity, filtered by phone. The operator: SQL (below). |
| Cost | About one row per change. A busy family makes a few hundred a day, about 7 MB a year. |

## Questions the log can answer

### "I lost one of my phones" (another phone is still linked)

1. Settings → Linked devices → tap the lost phone. Activity opens filtered to that phone.
2. **Has it been used since I lost it?** Its entries are listed newest first, with time, kind of phone and country. "Last used" on the device covers reads too (updated at most once a day), so a phone that only opened records still shows when it was last active.
3. **What did it change?** Each entry says what was added, edited or deleted, and for whom. Entries for records that still exist open them.
4. **Remove it**: the button at the top of that screen. Access stops on its next request.
5. If it may be in someone else's hands: make a new recovery key (Settings → Recovery key). The log records that too.
6. **Something was deleted from it?** The log says what kind of record, when and for whom. The content is in the family's latest backup ZIP (Restore can bring a vault back from it).

### "I lost every linked phone"

- **With the recovery key**: join the vault on a new phone (Welcome → "I lost my phone: use recovery key"). Activity shows what the lost phones did, including anything after they were lost. Remove each lost phone, then make a new recovery key, since the old one was just used on a new phone and may have been stored on a lost one.
- **Without the recovery key**: by design nobody can get back in, the operator included (there is no account and no password reset). The operator can still answer "was my vault used after I lost my phones, and from which country?" if the family can identify the vault (its name and security contact email, `vaults.contact_email`). The operator must not reveal anything else and cannot restore access. The family's backup ZIPs are the only way to recover the data into a new vault.

### "Someone I don't know may have access"

- **A phone nobody recognises**: every phone that joined has a "joined the vault with a link code" or "joined the vault with the recovery key" entry, with the kind of phone and country, and who made the link code just before it.
- **Unusual place**: entries from a country other than the vault's usual one carry an "Unusual place" mark.
- **Was the recovery key used?** "joined the vault with the recovery key" entries. A family that never lost a phone should have none.

### "Who changed this?"

- Who added, edited or deleted any record, and when. Edits list which fields changed ("dosage, notes"), not the old or new values.
- Who turned AI reading on or off, ran scans or medicine checks, and how often.
- Who set up or turned off reminders on which phone ("Mummy stopped getting reminders": were they turned off, and from which phone?).

### "Has our data left the vault?"

- Every backup download and restore, with phone and time. A backup ZIP holds everything, so this is the main way data leaves the app.

### Consent history (DPDP)

- When the vault agreed to each privacy notice version and when AI consent was given or withdrawn, as proof for the family and for the operator.

### For the operator: breach investigation

- Which vaults were touched in a time window, from which countries and kinds of phone.
- Spikes: many link codes, joins, deletes or backups in a short time across vaults.
- After a bug report ("a record vanished"): whether a delete was made, by which phone, or whether nothing in the log explains it (then it is a bug).
- Runbook: [COMPLIANCE.md](./COMPLIANCE.md) → Breach runbook.

### What the log cannot answer

- **Who looked at what.** Views are not logged.
- **What a record said before an edit, or what a deleted record contained.** Only field names and record types are kept. Use a backup.
- **Who the person was.** It knows the phone (name, kind, country), not the person holding it.
- **Anything older than a year.**

## Operator queries

Run with `npx wrangler d1 execute med-vault --remote --command "..."`.

```sql
-- One vault's last 100 entries
SELECT at, device_name, client, country, action, record_type, member_id FROM audit_log WHERE vault_id = '<vault id>' ORDER BY id DESC LIMIT 100;

-- Find a vault by its security contact email
SELECT id, name FROM vaults WHERE contact_email = '<email>';

-- Joins with the recovery key in the last 30 days, all vaults
SELECT at, vault_id, device_name, client, country FROM audit_log WHERE action = 'device.recover' AND at > datetime('now', '-30 days');

-- Activity per country in the last day (spot unusual traffic)
SELECT country, action, COUNT(*) AS n FROM audit_log WHERE at > datetime('now', '-1 day') GROUP BY country, action ORDER BY n DESC;
```

## Adding a new kind of change

New routes that change data are logged only if `auditFor()` in `worker/audit.ts` maps them: the record routes (`/members`, `/medications`...) are covered by one rule, everything else is listed by method and path. Add the action to `AuditAction` and `describeAudit()` in `shared/audit.ts`, and a case to `worker/audit.test.ts`. A route can add non-medical facts with `c.set("auditDetail", {...})`.
