// "Ask your doctor": checks across every current medicine, from every doctor.
// Built-in rules (this file) catch well-known problems reliably; the AI adds what rules miss.
// Everything is phrased as a question for the doctor, never as an instruction. See docs/ASK_YOUR_DOCTOR.md.

/** talk_soon: ask before the next dose or call the doctor; ask: raise at the next visit; note: good to know. */
export type ReviewLevel = "talk_soon" | "ask" | "note";

export interface ReviewItem {
  level: ReviewLevel;
  title: string;
  /** What to ask, in the family's words. */
  question: string;
  why: string;
  /** Medicine names involved (as entered). */
  medicines: string[];
  source: "rule" | "ai";
}

export interface MedReview {
  items: ReviewItem[];
  /** Medicine name → generic, as worked out by the AI (empty when the AI was unavailable). */
  generics: Record<string, string>;
  /** Fingerprint of the medicines, allergies and conditions checked; differs once anything changes. */
  key: string;
  checked_at: string;
  /** Model used, or null when only built-in checks ran. */
  model: string | null;
}

export interface ReviewResponse {
  review: MedReview | null;
  /** The medicines, allergies or conditions changed since the review. */
  stale: boolean;
}

export interface ReviewMed {
  name: string;
  /** Generic name if known (from the AI or the notes). */
  generic?: string | null;
  notes?: string | null;
  doctor?: string | null;
}

export const LEVEL_ORDER: Record<ReviewLevel, number> = { talk_soon: 0, ask: 1, note: 2 };

// ---------- medicine classes ----------
// Generic names plus common Indian brands. Matched against name + generic + notes.

type DrugClass = "methotrexate" | "nsaid" | "steroid" | "ssri" | "tramadol" | "opioid" | "blood_thinner" | "ppi" | "cotrimoxazole" | "penicillin" | "sulfa" | "benzo" | "folic";

const CLASSES: Record<DrugClass, { label: string; re: RegExp }> = {
  methotrexate: { label: "methotrexate", re: /methotrex|\bmtx\b|meditrex|folitrax|imutrex|oncotrex/i },
  nsaid: {
    label: "a painkiller (NSAID)",
    re: /ibuprofen|diclofenac|aceclofenac|naproxen|etoricoxib|celecoxib|indomethacin|ketorolac|piroxicam|mefenamic|nimesulide|etodolac|lornoxicam|brufen|combiflam|voveran|zerodol|hifenac|nucoxia|etoshine|arcoxia|meftal|nise\b|nimulid/i,
  },
  steroid: {
    label: "a steroid",
    re: /prednisolone|prednisone|methylprednisolone|deflazacort|dexamethasone|hydrocortisone|betamethasone|omnacortil|wysolone|medrol|defcort|dexona|decdan/i,
  },
  ssri: {
    label: "an antidepressant (SSRI/SNRI)",
    re: /escitalopram|sertraline|fluoxetine|paroxetine|citalopram|fluvoxamine|venlafaxine|desvenlafaxine|duloxetine|nexito|cipralex|serta|daxid|fludac|prodep|oleanz plus|venlor|duzela/i,
  },
  tramadol: { label: "tramadol", re: /tramadol|ultracet|tramazac|contramal/i },
  opioid: { label: "an opioid painkiller", re: /codeine|morphine|tapentadol|oxycodone|fentanyl|buprenorphine/i },
  blood_thinner: {
    label: "a blood thinner",
    re: /warfarin|acenocoumarol|acitrom|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|clopidogrel|clopilet|ticagrelor|prasugrel|ecosprin|aspirin/i,
  },
  ppi: { label: "a stomach-protection medicine (PPI)", re: /omeprazole|pantoprazole|rabeprazole|esomeprazole|lansoprazole|\bomez\b|\bpan\s?\d|pantocid|razo|rablet|nexpro|esoz/i },
  cotrimoxazole: { label: "co-trimoxazole", re: /sulfamethoxazole|trimethoprim|co-?trimoxazole|septran|bactrim/i },
  penicillin: { label: "a penicillin antibiotic", re: /amoxicillin|amoxycillin|ampicillin|cloxacillin|piperacillin|penicillin|augmentin|clavam|\bmox\b|novamox/i },
  sulfa: { label: "a sulfa medicine", re: /sulfamethoxazole|sulfasalazine|septran|bactrim|saaz/i },
  benzo: { label: "a sedative (benzodiazepine)", re: /alprazolam|clonazepam|lorazepam|diazepam|etizolam|nitrazepam|chlordiazepoxide|restyl|alprax|rivotril|clonotril|ativan|valium|etilaam/i },
  folic: { label: "folic acid", re: /folic|folate|folvite|homin|folinic|leucovorin/i },
};

const textOf = (m: ReviewMed) => [m.name, m.generic, m.notes].filter(Boolean).join(" ");
export const classesOf = (m: ReviewMed): DrugClass[] => (Object.keys(CLASSES) as DrugClass[]).filter((c) => CLASSES[c].re.test(textOf(m)));

/** Allergy words that stand for a whole class. */
const ALLERGY_CLASSES: Array<{ re: RegExp; cls: DrugClass }> = [
  { re: /penicillin|amoxi|ampicillin|augmentin/i, cls: "penicillin" },
  { re: /sulfa|sulpha|sulfonamide|septran|bactrim/i, cls: "sulfa" },
  { re: /nsaid|ibuprofen|diclofenac|painkiller|aspirin/i, cls: "nsaid" },
];

const names = (ms: ReviewMed[]) => ms.map((m) => m.name);
const list = (ms: ReviewMed[]) => {
  const n = names(ms);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};
/** "from Dr Rao and Dr Iyer" when more than one doctor is involved: the reason this feature exists. */
const doctorsNote = (ms: ReviewMed[]) => {
  const ds = [...new Set(ms.map((m) => m.doctor).filter(Boolean))];
  return ds.length > 1 ? ` They come from different doctors (${ds.join(", ")}), who may not know about each other's prescriptions.` : "";
};

/**
 * Built-in checks: allergy conflicts, the same kind of medicine twice, and a short list of
 * well-known risky combinations. Deliberately small and conservative.
 */
export function ruleChecks(meds: ReviewMed[], allergies: string[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  const by = new Map<DrugClass, ReviewMed[]>();
  for (const m of meds) for (const c of classesOf(m)) by.set(c, [...(by.get(c) ?? []), m]);
  const has = (c: DrugClass) => (by.get(c) ?? []).length > 0;
  const of = (...cs: DrugClass[]) => [...new Set(cs.flatMap((c) => by.get(c) ?? []))];
  const add = (level: ReviewLevel, ms: ReviewMed[], title: string, question: string, why: string) =>
    items.push({ level, title, question, why: why + doctorsNote(ms), medicines: names(ms), source: "rule" });

  // 1. Allergies
  for (const allergen of allergies) {
    const word = allergen.trim().toLowerCase();
    if (word.length < 3) continue;
    const cls = ALLERGY_CLASSES.find((a) => a.re.test(word))?.cls;
    const hits = meds.filter((m) => textOf(m).toLowerCase().includes(word) || (cls && classesOf(m).includes(cls)));
    if (hits.length)
      add("talk_soon", hits, `Allergy: ${allergen}`, `Is ${list(hits)} safe with the ${allergen} allergy?`, `${allergen} is recorded as an allergy, and ${list(hits)} looks like it may be the same or a related medicine.`);
  }

  // 2. The same kind of medicine twice
  for (const c of ["nsaid", "steroid", "ppi", "ssri", "benzo", "blood_thinner"] as DrugClass[]) {
    const ms = by.get(c) ?? [];
    if (ms.length > 1)
      add("ask", ms, `Two of the same kind: ${CLASSES[c].label}`, `Should both ${list(ms)} be taken, or is one enough?`, `Both look like ${CLASSES[c].label}. Taking two of the same kind can double the side effects.`);
  }

  // 3. Well-known combinations
  if (has("methotrexate") && has("cotrimoxazole"))
    add("talk_soon", of("methotrexate", "cotrimoxazole"), "Methotrexate with co-trimoxazole", "Is it safe to take co-trimoxazole while on methotrexate?", "This combination can seriously lower blood counts.");
  if (has("methotrexate") && has("nsaid"))
    add("ask", of("methotrexate", "nsaid"), "Methotrexate with a painkiller", "Is this painkiller okay with methotrexate, and are regular blood tests needed?", "Some painkillers (NSAIDs) can raise methotrexate levels in the blood.");
  if (has("methotrexate") && !has("folic"))
    add("note", of("methotrexate"), "Folic acid with methotrexate", "Should folic acid be taken alongside methotrexate?", "Doctors usually add folic acid to reduce methotrexate side effects. It may simply not be recorded here.");
  if (has("blood_thinner") && has("nsaid"))
    add("talk_soon", of("blood_thinner", "nsaid"), "Blood thinner with a painkiller", "Is it safe to take this painkiller with the blood thinner?", "Together they raise the risk of bleeding.");
  if (has("ssri") && (has("tramadol") || has("opioid")))
    add("talk_soon", of("ssri", "tramadol", "opioid"), "Antidepressant with tramadol or an opioid", "Is this painkiller safe with the antidepressant?", "This combination can cause serotonin syndrome or drowsiness.");
  if (has("benzo") && (has("opioid") || has("tramadol")))
    add("talk_soon", of("benzo", "opioid", "tramadol"), "Sedative with an opioid painkiller", "Is it safe to take these together?", "Both cause drowsiness and slow breathing; together the effect is stronger.");
  if (has("ssri") && (has("nsaid") || has("blood_thinner")))
    add("ask", of("ssri", "nsaid", "blood_thinner"), "Antidepressant with a painkiller or blood thinner", "Is there a bleeding risk with this combination, and is stomach protection needed?", "SSRIs together with NSAIDs or blood thinners raise the risk of stomach bleeding.");
  if (has("steroid") && has("nsaid") && !has("ppi"))
    add("ask", of("steroid", "nsaid"), "Steroid with a painkiller", "Is a stomach-protection medicine needed with these?", "A steroid and an NSAID together can irritate the stomach; doctors often add a PPI.");

  return items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/**
 * Keeps AI items that do not repeat a built-in finding about the same combination. Items about a
 * single medicine are always kept: one medicine can have several unrelated questions.
 */
export function mergeItems(rules: ReviewItem[], ai: ReviewItem[]): ReviewItem[] {
  const key = (i: ReviewItem) => [...i.medicines].map((m) => m.toLowerCase()).sort().join("|");
  const seen = new Set(rules.filter((i) => i.medicines.length > 1).map(key));
  const extra = ai.filter((i) => {
    if (i.medicines.length < 2) return true;
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...rules, ...extra].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
