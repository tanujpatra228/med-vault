import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { WEEKDAYS, formatQty, normalizeSchedule, type Dose, type Schedule, type Weekday } from "@shared/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScheduleDetails } from "@/components/ScheduleDetails";
import { cn } from "@/lib/utils";

type Mode = "daily" | "days" | "interval" | "taper" | "as_needed";

interface DayRow {
  days: Weekday[];
  dose: Dose;
}

interface TaperStep {
  days: number;
  dose: Dose;
}

/** UI-friendly editing state. "custom" holds what the editor can't represent, untouched. */
export type EditorState =
  | { mode: "daily"; dose: Dose }
  | { mode: "days"; rows: DayRow[] }
  | { mode: "interval"; every: number; dose: Dose }
  | { mode: "taper"; steps: TaperStep[] }
  | { mode: "as_needed"; note: string }
  | { mode: "custom"; schedule: Schedule }
  | { mode: "text"; text: string };

const ZERO: Dose = [0, 0, 0];
const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: "daily", label: "Every day" },
  { mode: "days", label: "Specific days" },
  { mode: "interval", label: "Every few days" },
  { mode: "taper", label: "Changing dose" },
  { mode: "as_needed", label: "When needed" },
];
const DAY_LETTERS: Record<Weekday, string> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };
const DAY_NAMES: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** Saved schedule (or legacy dosage text) -> editor state. */
export function toEditor(schedule: Schedule | null, legacyText?: string | null): EditorState {
  if (!schedule) return legacyText ? { mode: "text", text: legacyText } : { mode: "daily", dose: [...ZERO] };
  const [first] = schedule.phases;
  if (schedule.phases.length === 1 && first.days === null) {
    const p = first.pattern;
    switch (p.type) {
      case "daily":
        return { mode: "daily", dose: p.dose };
      case "interval":
        return { mode: "interval", every: p.every, dose: p.dose };
      case "as_needed":
        return { mode: "as_needed", note: p.note ?? "" };
      case "weekly": {
        const rows: DayRow[] = [];
        for (const day of WEEKDAYS) {
          const dose = p.days[day];
          if (!dose) continue;
          const row = rows.find((r) => r.dose.join() === dose.join());
          if (row) row.days.push(day);
          else rows.push({ days: [day], dose });
        }
        return { mode: "days", rows };
      }
    }
  }
  if (schedule.phases.every((ph) => ph.days !== null && ph.pattern.type === "daily")) {
    return { mode: "taper", steps: schedule.phases.map((ph) => ({ days: ph.days!, dose: (ph.pattern as { dose: Dose }).dose })) };
  }
  return { mode: "custom", schedule };
}

/** Editor state -> validated schedule; null when incomplete (e.g. no dose set yet) or plain text. */
export function fromEditor(s: EditorState): Schedule | null {
  const one = (pattern: unknown) => normalizeSchedule({ phases: [{ days: null, pattern }] });
  switch (s.mode) {
    case "daily":
      return one({ type: "daily", dose: s.dose });
    case "interval":
      return one({ type: "interval", every: s.every, dose: s.dose });
    case "as_needed":
      return one({ type: "as_needed", note: s.note || null });
    case "days": {
      const days: Partial<Record<Weekday, Dose>> = {};
      for (const r of s.rows) for (const d of r.days) days[d] = r.dose;
      return one({ type: "weekly", days });
    }
    case "taper":
      return normalizeSchedule({ phases: s.steps.map((st) => ({ days: st.days, pattern: { type: "daily", dose: st.dose } })) });
    case "custom":
      return s.schedule;
    case "text":
      return null;
  }
}

function slotLabels(timing: string | null | undefined): [string, string, string] {
  return /food|meal|breakfast|lunch|dinner/i.test(timing ?? "") ? ["Breakfast", "Lunch", "Dinner"] : ["Morning", "Afternoon", "Night"];
}

function Stepper({
  label,
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 10,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="type-label text-ink-muted">{label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="secondary" size="icon-sm" aria-label={`Less ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          <Minus />
        </Button>
        <span className="num w-10 text-center text-[17px] font-medium" aria-live="polite">
          {formatQty(value)}
        </span>
        <Button type="button" variant="secondary" size="icon-sm" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function DoseInput({ dose, onChange, timing }: { dose: Dose; onChange: (d: Dose) => void; timing?: string | null }) {
  const labels = slotLabels(timing);
  return (
    <div className="flex flex-col gap-2">
      {labels.map((label, i) => (
        <Stepper key={label} label={label} value={dose[i]} onChange={(n) => onChange(dose.map((q, j) => (j === i ? n : q)) as Dose)} />
      ))}
    </div>
  );
}

function DayChips({ value, taken, onChange }: { value: Weekday[]; taken: Weekday[]; onChange: (d: Weekday[]) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Days">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d);
        const disabled = !on && taken.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAMES[d]}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={cn(
              "flex size-10 items-center justify-center rounded-sm border type-label",
              on ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted",
              disabled && "opacity-35",
            )}
          >
            {DAY_LETTERS[d]}
          </button>
        );
      })}
    </div>
  );
}

const Card = ({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label: string }) => (
  <div className="flex flex-col gap-3 rounded-sm border border-rule bg-paper p-3">
    <div className="flex items-center justify-between">
      <span className="type-label text-ink-muted">{label}</span>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X />
        </Button>
      )}
    </div>
    {children}
  </div>
);

/**
 * Dosage schedule input. `timing` switches the slot labels to meals; the preview shows
 * exactly how the medicine will be described, so it can be checked against the paper.
 */
export function ScheduleEditor({
  value,
  onChange,
  timing,
  form,
  start,
}: {
  value: EditorState;
  onChange: (s: EditorState) => void;
  timing?: string | null;
  form?: string | null;
  start?: string | null;
}) {
  // Remember each mode's last input so switching back and forth doesn't lose work.
  const [memory, setMemory] = useState<Partial<Record<Mode, EditorState>>>({});
  const switchTo = (mode: Mode) => {
    if (value.mode !== "custom" && value.mode !== "text") setMemory((m) => ({ ...m, [value.mode]: value }));
    const saved = memory[mode];
    if (saved) return onChange(saved);
    const dose: Dose = value.mode === "daily" || value.mode === "interval" ? value.dose : [...ZERO];
    switch (mode) {
      case "daily":
        return onChange({ mode, dose });
      case "days":
        return onChange({ mode, rows: [{ days: [], dose }] });
      case "interval":
        return onChange({ mode, every: 2, dose });
      case "taper":
        return onChange({ mode, steps: [{ days: 4, dose }, { days: 3, dose: [...ZERO] }] });
      case "as_needed":
        return onChange({ mode, note: "" });
    }
  };

  const schedule = fromEditor(value);

  return (
    <div className="flex flex-col gap-3">
      <div className="type-label text-ink-muted">How to take</div>

      {value.mode === "custom" || value.mode === "text" ? (
        <div className="flex flex-col gap-3 rounded-sm border border-rule bg-paper p-3">
          {value.mode === "custom" ? (
            <ScheduleDetails schedule={value.schedule} start={start ?? null} timing={timing} form={form} />
          ) : (
            <Input value={value.text} onChange={(e) => onChange({ mode: "text", text: e.target.value })} aria-label="Dosage" />
          )}
          <p className="type-caption text-ink-faint">
            {value.mode === "custom" ? "This schedule came from a scan and is kept as it is." : "Saved as text."} Pick a type below to replace it.
          </p>
        </div>
      ) : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Schedule type">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            aria-pressed={value.mode === m.mode}
            onClick={() => switchTo(m.mode)}
            className={cn(
              "h-10 shrink-0 rounded-sm border px-3 type-label whitespace-nowrap",
              value.mode === m.mode ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === "daily" && <DoseInput dose={value.dose} timing={timing} onChange={(dose) => onChange({ ...value, dose })} />}

      {value.mode === "interval" && (
        <div className="flex flex-col gap-3">
          <Stepper label="Every how many days" value={value.every} step={1} min={2} max={30} onChange={(every) => onChange({ ...value, every })} />
          <DoseInput dose={value.dose} timing={timing} onChange={(dose) => onChange({ ...value, dose })} />
        </div>
      )}

      {value.mode === "days" && (
        <div className="flex flex-col gap-3">
          {value.rows.map((row, i) => {
            const taken = value.rows.flatMap((r, j) => (j === i ? [] : r.days));
            const update = (r: DayRow) => onChange({ ...value, rows: value.rows.map((x, j) => (j === i ? r : x)) });
            return (
              <Card key={i} label={value.rows.length > 1 ? `Days group ${i + 1}` : "Days"} onRemove={value.rows.length > 1 ? () => onChange({ ...value, rows: value.rows.filter((_, j) => j !== i) }) : undefined}>
                <DayChips value={row.days} taken={taken} onChange={(days) => update({ ...row, days })} />
                <DoseInput dose={row.dose} timing={timing} onChange={(dose) => update({ ...row, dose })} />
              </Card>
            );
          })}
          {value.rows.flatMap((r) => r.days).length < 7 && (
            <Button type="button" variant="secondary" onClick={() => onChange({ ...value, rows: [...value.rows, { days: [], dose: [...ZERO] }] })}>
              <Plus /> Different dose on other days
            </Button>
          )}
        </div>
      )}

      {value.mode === "taper" && (
        <div className="flex flex-col gap-3">
          {value.steps.map((step, i) => {
            const update = (st: TaperStep) => onChange({ ...value, steps: value.steps.map((x, j) => (j === i ? st : x)) });
            return (
              <Card key={i} label={`Step ${i + 1}`} onRemove={value.steps.length > 1 ? () => onChange({ ...value, steps: value.steps.filter((_, j) => j !== i) }) : undefined}>
                <Stepper label="For how many days" value={step.days} step={1} min={1} max={365} onChange={(days) => update({ ...step, days })} />
                <DoseInput dose={step.dose} timing={timing} onChange={(dose) => update({ ...step, dose })} />
              </Card>
            );
          })}
          {value.steps.length < 10 && (
            <Button type="button" variant="secondary" onClick={() => onChange({ ...value, steps: [...value.steps, { days: 3, dose: [...ZERO] }] })}>
              <Plus /> Add step
            </Button>
          )}
        </div>
      )}

      {value.mode === "as_needed" && (
        <Input value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="e.g. if fever above 100°F, max 3 a day" aria-label="When to take" />
      )}

      {value.mode !== "custom" && value.mode !== "text" && (
        <div className="rounded-sm border border-rule bg-sheet p-3" aria-live="polite">
          <div className="meta mb-1 text-ink-faint">Preview</div>
          {schedule ? (
            <ScheduleDetails schedule={schedule} start={start ?? null} timing={timing} form={form} />
          ) : (
            <p className="type-label text-ink-faint">{value.mode === "days" ? "Pick the days and how many to take." : "Set how many to take."}</p>
          )}
        </div>
      )}
    </div>
  );
}
