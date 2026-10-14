# Reminders

Status: **built**. Code: `shared/reminders.ts` (timing and messages), `worker/webpush.ts` (encryption and VAPID), `worker/reminders.ts` (cron job and API), `src/lib/push.ts`, `src/components/RemindersSettings.tsx`, `public/sw.js` (shows the notification).

## What it does

Settings → Reminders → **Remind me on this phone**. Each phone is set up on its own: Maa's phone can get her reminders while yours gets everyone's.

| Reminder | When | Example |
|---|---|---|
| **Medicine times** | Morning, afternoon, night (default 08:00, 14:00, 21:00, editable) | "Maa: Meditrex 5 mg: 2 after breakfast · Papa: Metformin: 1" |
| **Follow-up visits** | The day before and on the day, at one time (default 09:00) | "Tomorrow: Maa with Dr Shah (Bring CBC)" |
| **Monthly backup** | Only when no backup was made in 30 days | "Time for a backup" |

- Only what is due **that day**: weekly medicines (Meditrex on Saturday), tapers (Omnacortil's ½ tablet on day 5) and finished or stopped medicines are handled by the same schedule logic as the medicine cards.
- One notification per time slot for the whole family, grouped by person. Nothing due, nothing sent.
- **Remind about**: pick which family members this phone hears about.
- **Show medicine and doctor names**: off shows "Maa: 2 medicines" so nothing medical is on the lock screen.
- Tapping a notification opens the right screen (the member, the visit, or Settings for backups).
- **Send a test** confirms the phone receives them.

Not included: refill reminders. The app does not track how many tablets are left, and guessing would be wrong more often than right. Revisit if a pill count is added.

## How

1. The phone subscribes with the browser's Push API. The server's public VAPID key comes from `GET /api/push/key`.
2. `PUT /api/push/subscription` saves the push address, its two keys, the phone's time zone and its settings (`push_subscriptions`, linked to the device, so unlinking a device removes it).
3. A **Cron Trigger every 5 minutes** (`wrangler.jsonc`) runs `runReminders`: for each phone it works out what is due in that phone's time zone, skips anything already in `reminder_log`, loads each vault's active medicines and open follow-ups once, builds the message and sends it.
4. Messages are encrypted to the phone (RFC 8291, aes128gcm) and signed with VAPID (ES256) using WebCrypto only, no libraries. Google's push service delivers them but cannot read them. Verified against the RFC 8291 test vector.
5. A reminder can arrive up to 90 minutes late (if a run was missed or the queue was long), never later. A push service answering 404/410 means the phone unsubscribed: the subscription is deleted.

### Free plan limits

- Each push costs about 1-2 ms of CPU (key agreement plus signing). A cron run is capped at **4 pushes** to stay under 10 ms; the rest go in the next run 5 minutes later. That is about 48 pushes an hour, plenty for a few families. If many vaults share the app, morning slots will spread over 15-30 minutes. The paid plan (30 s CPU) removes the cap.
- 288 cron runs a day count toward the 100,000 requests/day limit.
- The VAPID key pair is generated on first use and stored in D1 (`app_keys`). No secret to set up. Anyone who can read the database can already read every record, so a separate secret adds no protection.

### Endpoint allowlist

Only real push services are accepted (`fcm.googleapis.com`, Mozilla, Windows, Apple), so the server cannot be used to send requests to arbitrary URLs. Local development allows `localhost` when `PUSH_ALLOW_LOCAL=1` in `.dev.vars`.

## Data kept

Per phone: push address and keys, time zone, settings, last sent time. `reminder_log` keeps which reminders were sent for 3 days (to avoid duplicates), then deletes them. Turning reminders off deletes the subscription. See [COMPLIANCE.md](./COMPLIANCE.md).

## Testing locally

`.dev.vars` needs `PUSH_ALLOW_LOCAL=1`. Run a fake push service on `localhost:9999`, subscribe a test client to it, then trigger a run at any time:

```
curl -X POST localhost:5173/api/push/run -H 'content-type: application/json' -d '{"at":"2026-10-10T02:35:00Z"}'
```

`/api/push/run` returns 404 in production. Real delivery to a phone can only be checked on the phone: enable reminders and tap **Send a test**.
