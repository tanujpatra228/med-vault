# Privacy and Compliance (India)

Status: privacy notice, consent and audit log **built**. Audit log details: [AUDIT_LOG.md](./AUDIT_LOG.md).

This is a working summary for the project, not legal advice. Before opening Med Vault beyond family and close friends, or registering a company, review it with an Indian data-protection lawyer.

## What applies

| Law | Status (Oct 2026) | Applies to Med Vault? |
|---|---|---|
| **DPDP Act 2023 + DPDP Rules 2025** | Rules notified 13 Nov 2025, phased. Consent, notice, security, breach, children and erasure duties apply from **13 May 2027**. | Yes, once people outside the operator's own family use the deployment. |
| SPDI Rules 2011 (IT Act s.43A) | In force until the DPDP duties replace them | Companies ("body corporates") only. An individual operator is likely outside it. |
| DISHA (proposed health data law) | Never enacted | No |
| ABDM / Health Data Management Policy | Voluntary | Only if integrating with ABHA/ABDM |
| CERT-In directions 2022 (6-hour incident report, 180-day logs) | In force | Service providers and companies; grey area for an individual |

There is no HIPAA equivalent. DPDP treats health data like any other personal data: there is no special category.

**Personal-use exemption.** DPDP does not apply to an individual processing data for a personal or domestic purpose, which covers one family keeping its own records. Running the app for other families is no longer purely domestic, so the operator becomes a **Data Fiduciary** for their data and Cloudflare is the **Data Processor**.

## How Med Vault meets the DPDP duties

| Duty | How |
|---|---|
| Notice (Rule 3): an itemised list of the data, the purposes and the services, plus how to withdraw, use rights and complain | `/privacy`, readable before a vault exists (`src/components/PrivacyNotice.tsx`). Versioned in `shared/privacy.ts`. |
| Consent: free, specific, informed, unambiguous, affirmative | Two unticked boxes on vault creation, checked on the server (`assertConsent`). The version and time are stored on `vaults`. A new notice version makes every vault agree again (`ReConsent`). |
| Specific consent for a separate purpose (AI) | AI is **off** until the vault allows it, either at the first scan or in Settings. The server refuses scans without it. Medicine checks fall back to built-in rules. |
| Withdrawal as easy as giving consent | Settings → AI "Turn off". Withdrawing all consent = delete the vault. |
| Children (verifiable parental consent, under 18) | The vault creator confirms they are 18+ and a parent, guardian or authorised by the family member. |
| Access and portability | Settings → Backup (ZIP plus readable `Open me.html`) |
| Correction | Every record is editable |
| Erasure | Delete a record, a member or the whole vault. R2 files are removed immediately. D1 point-in-time recovery keeps data for up to 30 days, as the notice says. |
| Nomination | The notice tells people to share the recovery key with someone they trust |
| Grievance redressal | The operator's contact is shown in the notice and Settings. Set it in `wrangler.jsonc` → `vars.GRIEVANCE_EMAIL` (and `OPERATOR_NAME`). |
| Data minimisation | No account, phone, Aadhaar or payment data. IP addresses only in `rate_events`, purged after 2 days. Reminders keep only a push address, time zone and settings per phone; the sent log is purged after 3 days. |
| Security safeguards (Rule 6) | TLS. Cloudflare encryption at rest. Device keys, link codes and the recovery key are stored as SHA-256 only. Every query is scoped by `vault_id`, with cross-vault reference checks. |
| Breach notice to the Board and to individuals | Runbook below. Optional per-vault security contact email (Settings → Privacy) plus an in-app notice. |
| Processor contract | Cloudflare's self-serve terms and data processing addendum. Reminders pass through the phone's push service (Google FCM on Android) end-to-end encrypted (RFC 8291), so it cannot read them; "Show medicine and doctor names" off keeps medical words off the lock screen. Workers AI documentation says Cloudflare does not use inputs or outputs to train models or share them with other customers. |
| Cross-border transfer | Allowed unless the government restricts a country. Cloudflare may store data outside India, as the notice says. |
| Logs for 1 year (Rule 6) | Security log of every change, sign-in event, backup and AI use, kept one year (also after the vault is deleted), then purged daily. No medical content, no IP. The family sees it in Settings → Activity. See [AUDIT_LOG.md](./AUDIT_LOG.md). The notice says so; it is a legal-obligation use, so no new consent was asked (`PRIVACY_VERSION` unchanged). |

## Before sharing beyond your own family

1. Set `OPERATOR_NAME` and `GRIEVANCE_EMAIL` in `wrangler.jsonc` and deploy. Until then, the notice says "the person who shared this app with you".
2. Add your own security contact email in Settings → Privacy.

## Breach runbook

A breach is any unauthorised access to, or loss of, personal data: for example a leaked API token, a bug that shows one vault's data to another, or a lost backup ZIP that the operator held.

| When | Do |
|---|---|
| **Immediately** | Contain: rotate `CLOUDFLARE_API_TOKEN`. If needed, put the Worker behind maintenance (deploy a version that returns 503). Revoke affected devices (`DELETE FROM devices WHERE vault_id IN (...)`). Keep evidence: Workers logs, timestamps, what changed. |
| **Without delay** | Tell the **Data Protection Board of India**: what happened, when, likely impact, and what is being done. |
| **Without delay** | Tell affected families: email every affected vault's `contact_email`, and show an in-app notice. Say what happened, what data, what they should do, and who to contact. |
| **Within 72 hours** | Send the Board the detailed report: facts, cause, people affected, measures taken, how to prevent it again. |
| After | Fix the cause, add a test, and update this file. |

Finding the affected vaults' contacts:
`npx wrangler d1 execute med-vault --remote --command "SELECT id, name, contact_email FROM vaults WHERE contact_email IS NOT NULL"`

## Audit log

Built: see [AUDIT_LOG.md](./AUDIT_LOG.md) for what is logged, retention, and the questions it answers (lost phones, unknown access, who changed what, breach investigation).
