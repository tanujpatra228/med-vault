# Launch Plan: Five Platforms

r/SideProject, Hacker News, Product Hunt, Indie Hackers and Uneed reach **builders**, mostly outside India. They are not our core users (Indian families caring for parents). Use them for what they are good at:

| What they give | What they don't |
|---|---|
| Sharp product feedback, early bug reports | Many Indian caregivers |
| Credibility ("Featured on Product Hunt") for the landing page | Retention: builders try, few stay |
| Backlinks that help Google search later | Revenue |
| Some NRIs and Indian techies who manage parents' health | |

Success here = 300+ visits, 50+ vaults created, 20+ pieces of feedback, at least 1 launch badge. Track each with `?src=reddit`, `?src=hn`, `?src=ph`, `?src=ih`, `?src=uneed`.

## Before any launch (week 0)

1. **Public demo vault.** Nobody types their mother's health data into a stranger's app to test it. Add a "See a demo family" button on the welcome screen that opens a read-only copy of the Sharma family. This one change will decide conversion on HN and Product Hunt.
2. **Custom domain** (e.g. medvault.in). `*.workers.dev` reads as a hobby project, and trust is the whole sale for health data.
3. **Set `OPERATOR_NAME` and `GRIEVANCE_EMAIL`.** Builders will open the privacy page.
4. **Assets:** 30 s demo video (Script 0c), 5 screenshots (home, member summary, HbA1c trend, Visit brief, medicine check), logo 240x240, one-line tagline.
5. **Answers ready for the hard questions** (bottom of this file).

## Order and timing

Smaller, forgiving audiences first; fix what they find; the two big ones last.

| When | Platform | Why this slot |
|---|---|---|
| Day 1 | **Uneed**: submit | Free queue can take weeks. Get in line now. |
| Week 1, Tue | **r/SideProject** | Friendly, gives honest feedback. Your rehearsal. |
| Week 1, Thu | **Indie Hackers** | Story-first audience. Builds a follower base for later posts. |
| Week 2, Tue | **Show HN** | Toughest crowd and biggest spike. Go after fixing Reddit feedback. |
| Week 3, Tue or Wed | **Product Hunt** | Needs assets, supporters and a polished page. Last, best foot forward. |
| Uneed launch day | **Uneed** | Whatever date the queue gives; share it on LinkedIn that day. |

Never launch two on the same day: you can't answer comments on both, and replies are what rank you.

## Platform by platform

### r/SideProject

- **Rules:** self-promotion is allowed, but a link dump dies. Tell the story, show the screen, ask a real question.
- **Post:** Tuesday to Thursday, 7 to 9 PM IST (morning in the US).
- **Format:** image post or 30 s video, link in the first comment.
- **Title:** `We paid for the same blood test twice because nobody remembered. So I built a medical records app for my family that needs no signup.`
- **Body:**
  > My mom sees three doctors. Every visit: "what medicines is she on? any recent reports?" We never knew. Two months after a blood test, a doctor prescribed the same one and we paid again.
  >
  > So I built MedVault: every prescription, report, BP and sugar reading for the whole family in one place. Snap a prescription and it fills itself in. Lab results become trend charts. One screen to show any doctor, or send on WhatsApp.
  >
  > No phone, no email, no OTP: you get a vault and a recovery key. Built on Cloudflare Workers, D1 and R2, as an Android PWA.
  >
  > Demo family (no data needed): [link]
  >
  > Honest question: would you trust an app with no account for health data, or does that make you trust it less?
- **Then:** reply to every comment within the first 3 hours.

### Indie Hackers

- **Where:** a post in the main feed, plus a product page.
- **Angle:** the builder's journey and numbers. IH loves "what I learned" and real metrics.
- **Title:** `I built a family health records app with no signup. Here's what the no-account decision cost me.`
- **Body outline:** the problem story (3 lines) → why no signup (spam calls in India, trust) → the trade-off (lose phone and recovery key = lose vault; how link codes and backups solve it) → stack and cost (Cloudflare Workers, D1, R2; what it costs to run) → what's next (validation, paid tier idea) → ask: "How would you price this for families?"
- **Then:** post monthly milestone updates there (users, retention, what failed). Consistency builds the audience.

### Show HN

- **Rules:** must be usable without signup (we are, which is a strength), no asking for upvotes, no friends voting from one link (the ring gets flagged). Post it yourself and stay for 4 to 6 hours.
- **Post:** Tuesday to Thursday, 7:30 to 9:30 PM IST (8 to 10 AM US Eastern).
- **Title:** `Show HN: MedVault, family medical records with no account (India)`
- **First comment (post it right away):**
  > I built this after we paid for the same blood test twice because nobody in the family remembered the earlier one.
  >
  > What it does: prescriptions, reports, medicines, BP and sugar for each family member. A photo of a prescription or lab report is read by Workers AI into an editable form. Lab results become per-test trend charts with medicine changes underneath. A "Visit brief" gives a doctor one screen.
  >
  > Design choices: no account at all. Each phone holds a device key; more phones join with a one-time code; a recovery key restores access. Hono on Cloudflare Workers, D1, R2, React PWA, works offline.
  >
  > Trade-offs I'd love opinions on: data is encrypted at rest by Cloudflare but not end-to-end, so I can technically read it. E2E would break server-side AI and search. Is that the right call for this audience?
  >
  > Demo family, no data needed: [link]
- **Expect:** sharp privacy and security criticism. Answer with facts, never defensively. Upvotes come from good replies.

### Product Hunt

- **Prep (start 7 days before):** use your PH account daily (comment, upvote others) so it isn't brand new. Line up 30 to 50 people who will **leave a genuine comment** on launch day. Ask for feedback, not upvotes: asking for upvotes breaks PH rules and gets you buried.
- **Launch:** 12:01 AM Pacific = **12:31 PM IST** (1:31 PM IST outside US daylight time). Tuesday or Wednesday.
- **Name:** MedVault
- **Tagline (60 chars):** `Your family's medical file, on one phone. No signup.`
- **Gallery:** 1) video 2) home screen 3) Visit brief 4) HbA1c trend 5) "Two doctors, one allergy" medicine check 6) "No phone. No email. No OTP."
- **Maker comment:** the hero story, 3 features, the no-signup choice, and one question ("What would make you trust a health app?").
- **Launch day:** reply to every comment within 15 minutes. Share on LinkedIn, Instagram story and WhatsApp with the PH link at noon IST, again at 8 PM IST (US morning).

### Uneed

- **Submit today** at uneed.best. The free queue gives you a launch date, often weeks away; paid options skip the line. Free is fine, the timing works for us.
- Use the same tagline, logo and screenshots as Product Hunt.
- On launch day, share the Uneed link once on LinkedIn and with the people who liked the PH launch.

## Hard questions: have answers ready

| They'll ask | Answer |
|---|---|
| "No account? So if I lose my phone, my data is gone?" | Link a second phone with a code, keep the recovery key, download a backup ZIP. Lose all three and it is gone: that's the honest cost of no signup. |
| "Can you read my data?" | Yes, technically: encrypted at rest, not end-to-end. Needed for AI scans and search. No ads, no selling, no third-party tracking. Every change, sign-in and backup is in the Activity log you can see. |
| "Is it HIPAA / compliant?" | Built for India's DPDP Act: consent, export, deletion, a one-year security log. Not legally certified; India has no health-record certification. Don't claim more. |
| "Where is data stored?" | Cloudflare, which may store it outside India. The privacy notice says so. |
| "Why Android only?" | It's a PWA; Android first because that's what most Indian families use. iPhone is untested. |
| "Business model?" | Free while validating. A paid family plan later (storage, AI scans, insurance pack). Data will never be sold. |
| "AI on medical documents, what if it's wrong?" | AI only fills the form; you check and save. Medicine checks are phrased as questions for the doctor, not advice. |

## After each launch

- Same evening: note visits, vaults created, top 3 complaints by `src`.
- Fix the top complaint before the next launch.
- Reply to late comments for 3 days; HN and Reddit threads keep getting traffic.
- Turn the best comment threads into content ("HN asked if I can read your data. Here's the honest answer.").
