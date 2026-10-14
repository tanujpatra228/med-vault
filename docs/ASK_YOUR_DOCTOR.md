# "Ask your doctor": Medicine Review

Status: **built**. Code: `shared/review.ts` (built-in checks), `worker/review.ts` (endpoint, AI, cache), `src/pages/member/AskDoctorSection.tsx`, migration `0003`.

## Why

Maa sees three doctors who never see each other's prescriptions. Nobody checks the whole list together. This feature does, and turns what it finds into **questions for the next visit**. It never tells anyone to stop, start or change a medicine.

## What the family sees

Member summary → **Questions for the doctor** → "Check the medicines". Each finding is a card:

| Level | Badge | Meaning |
|---|---|---|
| `talk_soon` | Ask soon (rust) | Possible serious harm: ask before continuing, or call the doctor |
| `ask` | Next visit | Raise at the next appointment |
| `note` | Good to know | Low risk, worth confirming |

Each card shows the medicines involved, the question to ask, and why. When the medicines come from different doctors, the reason says so by name. The result is saved; once a medicine, allergy or condition changes, it is marked out of date with "Check again". Current questions are printed in the **Visit brief** and included in its shared text.

Fixed wording under every review: "Questions to ask, not medical advice. Never stop or change a medicine without asking the doctor."

## How it works

1. **Built-in checks** (`ruleChecks`, always run, no AI): a small, conservative list matched on generic names and common Indian brands.
   - Allergy conflicts, by name and by class (penicillin, sulfa, NSAID).
   - Two medicines of the same kind (two NSAIDs, two steroids, two PPIs, two SSRIs, two sedatives, two blood thinners).
   - Well-known combinations: methotrexate + co-trimoxazole, methotrexate + NSAID, methotrexate without folic acid, blood thinner + NSAID, SSRI + tramadol/opioid, sedative + opioid, SSRI + NSAID/blood thinner, steroid + NSAID without stomach protection.
2. **AI review** (Workers AI, text only, same models as scanning): gets age, sex, allergies, conditions and each medicine with its dose and doctor. Returns each medicine's generic name and up to 6 findings as questions. The generics feed back into the built-in checks, so unfamiliar brands are still recognised.
3. **Merge:** built-in findings come first; AI findings about the same combination are dropped. Server-side validation keeps only known levels and medicine names that were actually sent.
4. If the AI is unavailable or the daily limit is reached, the built-in checks still run and the card says "built-in checks only".

Each review uses one of the vault's 30 daily AI calls (shared with scans). Results are cached per member (`med_reviews`), so opening the summary never spends AI.

## Limits

- The built-in list is short on purpose: a false alarm erodes trust as much as a miss. Add rules only for well-established, high-impact combinations, with a test.
- The AI can be wrong in both directions. It is a prompt for a conversation with the doctor, not a safety guarantee.
