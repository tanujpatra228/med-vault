# Backup and Restore

Status: **built**. Code: `src/lib/zip.ts`, `src/lib/backup.ts`, `src/lib/backupHtml.ts`, `src/components/Backup.tsx`, `worker/backup.ts`, `shared/backup.ts`.

## Why

No signup means no account to fall back on. Lose every linked phone **and** the recovery key, and the vault is gone. A backup file the family keeps (Google Drive, a computer) closes that gap.

## Making a backup

Settings → Backup → **Download backup** (or **Save to Drive…**, which opens the Android share sheet). One ZIP:

```
Med Vault backup <vault> <date>.zip
├── Open me.html        every member's records as one readable page, opens in any browser without the app
├── data.json           every record (format below), used for restore
└── files/<member>/     photos and PDFs, named "<date> Prescription Dr Rao 1.jpg", "<date> CBC 1.pdf", ...
```

- The ZIP is built **on the phone**: the Worker returns the records (`GET /api/vault/export`), the app downloads each file and packs them. The Worker never buffers a 2 GB vault, and the free plan's 10 ms CPU limit is never at risk.
- Entries are stored, not compressed: photos and PDFs are already compressed. The ZIP code is ~150 lines with no dependency.
- Settings shows "Last backup from this phone" (kept on the phone).

## Restoring

Create a new vault, then tap **Restore from a backup** (on the empty home screen, or Settings → Backup while the vault is empty) and pick the ZIP.

1. The app reads `data.json` and checks it is a Med Vault backup.
2. Records go up table by table (doctors, members, conditions, allergies, prescriptions, medications, reports) in chunks of 150 rows (`POST /api/vault/restore`). Each request stays well inside 10 ms of CPU (validation measured at ~15–30 µs per row).
3. The Worker validates every row like a normal write, gives it a **new id** (so a backup can be restored next to the original vault), rewrites links using the id maps the app sends, and checks every linked id belongs to this vault.
4. The first chunk requires an empty vault. If any chunk fails, the app deletes the restored members and doctors (cascading to everything else), so the vault is either fully restored or left empty.
5. Files are uploaded one by one to their new owners through the normal upload API (quota and type checks apply). Files that fail are listed; records stay.

## data.json

```jsonc
{
  "format": "med-vault-backup",
  "version": 1,
  "exported_at": "2026-10-14T03:44:00.000Z",
  "vault": { "name": "Patra family", "created_at": "..." },
  "members": [...], "doctors": [...], "conditions": [...], "allergies": [...],
  "prescriptions": [...], "medications": [...], "reports": [...],
  "files": [{ "id": "...", "owner_type": "prescription", "owner_id": "...", "mime_type": "image/jpeg", "path": "files/Maa/2026-10-12 Prescription Dr Rao 1.jpg", ... }]
}
```

Rows are the database rows without `vault_id`. A newer app reads older versions; an older app refuses newer ones.

## Not included

Linked devices, link codes and the recovery key: a restored vault gets its own.
