// Visits and follow-ups. See docs/VISITS.md.

/**
 * Days until the next visit from what the doctor wrote, e.g. "Review after 2 weeks",
 * "Follow up after 15 days", "1 महीने बाद", "15 દિવસ પછી". Null when no interval is written.
 */
export function parseFollowUpDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d)));
  const units: Array<[RegExp, number]> = [
    [/(day|days|दिन|દિવસ|d\b)/, 1],
    [/(week|weeks|wk|wks|हफ्त|हफ़्त|सप्ताह|અઠવાડિય)/, 7],
    [/(month|months|mon\b|महीन|मास|માસ|મહિન)/, 30],
  ];
  const m = t.match(/(\d{1,3}(?:\.\d)?|one|two|three|four|six|ek|do)\s*(?:-|to\s+\d+\s*)?\s*([^\d\s,.;)]+)/g);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6, ek: 1, do: 2 };
  for (const part of m ?? []) {
    const [, n, unit] = part.match(/^(\d{1,3}(?:\.\d)?|one|two|three|four|six|ek|do)\s*(?:-|to\s+\d+\s*)?\s*(.+)$/) ?? [];
    const count = words[n] ?? Number(n);
    const per = units.find(([re]) => re.test(unit))?.[1];
    if (per && count > 0) {
      const days = Math.round(count * per);
      if (days >= 1 && days <= 365) return days;
    }
  }
  if (/\b(a|next)\s+week\b|weekly review/.test(t)) return 7;
  if (/\b(a|next)\s+month\b/.test(t)) return 30;
  return null;
}

/** The date `days` after `from` (YYYY-MM-DD). */
export function addDaysIso(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
