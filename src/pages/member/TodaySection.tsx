import { Link } from "react-router";
import type { Medication } from "@shared/types";
import { formatQty, nextDayLabel } from "@shared/schedule";
import { Section } from "@/components/layout";
import { RowList } from "@/components/Row";
import { medView } from "@/lib/meds";
import { today } from "@/lib/format";

const SLOTS = ["Morning", "Afternoon", "Night"] as const;

function slotPhrase(timing: string | null, slot: number): string | null {
  const t = (timing ?? "").toLowerCase();
  if (!/food|meal|breakfast|lunch|dinner/.test(t)) return null;
  return `${/before|empty/.test(t) ? "before" : "after"} ${["breakfast", "lunch", "dinner"][slot]}`;
}

/** What to take today, grouped by time of day, plus what is deliberately not due today. */
export function TodaySection({ meds }: { meds: Medication[] }) {
  const date = today();
  const due: Array<Array<{ med: Medication; qty: number }>> = [[], [], []];
  const asNeeded: Medication[] = [];
  const notToday: Array<{ med: Medication; next: string | null }> = [];

  for (const med of meds) {
    const t = medView(med, date).today;
    if (!t) continue;
    if (t.kind === "due") t.dose.forEach((qty, slot) => qty > 0 && due[slot].push({ med, qty }));
    else if (t.kind === "as_needed") asNeeded.push(med);
    else if (t.kind === "rest") notToday.push({ med, next: t.next });
  }
  if (due.every((s) => !s.length) && !asNeeded.length && !notToday.length) return null;

  return (
    <Section title="Today's medicines">
      <div className="flex flex-col gap-4">
        {due.map(
          (items, slot) =>
            items.length > 0 && (
              <div key={slot}>
                <div className="mb-1.5 type-label text-ink-muted">{SLOTS[slot]}</div>
                <RowList>
                  {items.map(({ med, qty }) => (
                    <Link key={med.id} to={`/medications/${med.id}`} className="-mx-4 flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-rule-soft/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-body font-semibold">
                          {med.name}
                          {med.strength && <span className="font-normal text-ink-muted"> {med.strength}</span>}
                        </span>
                        {slotPhrase(med.timing, slot) && <span className="block type-label text-ink-faint">{slotPhrase(med.timing, slot)}</span>}
                      </span>
                      <span className="num text-[17px] font-medium">{formatQty(qty)}</span>
                    </Link>
                  ))}
                </RowList>
              </div>
            ),
        )}
        {asNeeded.length > 0 && (
          <p className="type-label text-ink-muted">
            <span className="font-semibold text-ink">When needed:</span> {asNeeded.map((m) => m.name).join(", ")}
          </p>
        )}
        {notToday.length > 0 && (
          <p className="type-label text-ink-muted">
            <span className="font-semibold text-ink">Not today:</span>{" "}
            {notToday.map(({ med, next }) => `${med.name}${next ? ` (next ${nextDayLabel(next, date)})` : ""}`).join(", ")}
          </p>
        )}
      </div>
    </Section>
  );
}
