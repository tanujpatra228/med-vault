# Search

Status: **built**. Code: `shared/search.ts`, `worker/search.ts`, `src/pages/Search.tsx`.

## What it does

The search icon on the home screen searches the whole vault. The search icon on a member's profile searches only that person's records ("Search everyone" widens it).

Searched:

| Type | Fields |
|---|---|
| Family members | name, relation, blood group, notes |
| Medicines | name, strength, dose, timing, notes, doctor, linked conditions |
| Prescriptions | notes, doctor and specialty, linked conditions |
| Reports | title, lab, type, notes, linked conditions |
| Lab results | test name (ESR, HbA1c…), canonical test |
| Health conditions | name, notes |
| Allergies | allergen, reaction, notes |
| Visits | reason, notes, follow-up note, doctor, linked conditions |
| Doctors | name, specialty, clinic, phone, address, notes (whole-vault search only) |

- **Every word must match**, anywhere in the record: "patel meditrex" finds Dr Patel's Meditrex. Up to 6 words. Part of a word works ("metfor").
- Results are grouped by type, newest first, up to 8 per type ("8+" means more exist: add a word).
- Matched words are highlighted. Each result shows whose record it is and its date.
- The query stays in the URL, so Back from a result returns to the same results. The last 6 searches are kept on the phone only.

## How

One `SELECT` per record type with a `LIKE` for each word, sent as a single D1 batch (9 statements, well under the per-request query limit). Every statement is scoped by `vault_id`. `%`, `_` and `\` in a query are matched literally.

## Limits and next steps

- `LIKE` is case-insensitive for English letters; Hindi and Gujarati match exactly as typed.
- No spelling tolerance ("metphormin" finds nothing). If vaults grow large or fuzzy matching is needed, the next step is a D1 FTS5 index kept up to date on every write.
- Photo text is not searched. Scans fill the record's fields, and those are searched.
