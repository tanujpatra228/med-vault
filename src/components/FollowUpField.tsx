import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/format";

const QUICK = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

/** "Next follow-up": a date with one-tap intervals counted from the visit, plus what to bring. */
export function FollowUpField({
  from,
  date,
  note,
  onDate,
  onNote,
  writtenAs,
}: {
  from: string;
  date: string;
  note: string;
  onDate: (d: string) => void;
  onNote: (n: string) => void;
  /** What the prescription said, from a scan. */
  writtenAs?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-rule bg-sheet p-4">
      <Field label="Next follow-up" hint={writtenAs ? `Written: "${writtenAs}"` : "When the doctor asked to see you again"}>
        <Input type="date" value={date} min={from || undefined} onChange={(e) => onDate(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => {
          const value = from ? addDays(from, q.days) : "";
          return (
            <button
              key={q.days}
              type="button"
              disabled={!from}
              onClick={() => onDate(date === value ? "" : value)}
              className={cn(
                "h-8 rounded-sm border px-3 type-label",
                date && date === value ? "border-iris bg-iris-surface text-iris" : "border-rule bg-paper text-ink-muted hover:bg-rule-soft",
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      {date && (
        <Field label="For the follow-up" hint="e.g. Bring CBC and LFT reports, fasting">
          <Input value={note} onChange={(e) => onNote(e.target.value)} maxLength={300} />
        </Field>
      )}
    </div>
  );
}
