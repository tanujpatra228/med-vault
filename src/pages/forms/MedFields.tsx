import { MED_FORMS } from "@shared/types";
import type { Schedule } from "@shared/schedule";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { ScheduleEditor, fromEditor, toEditor, type EditorState } from "@/components/ScheduleEditor";
import { capitalize } from "@/lib/format";

export interface MedDraft {
  name: string;
  strength: string;
  form: string;
  timing: string;
  end_date: string;
  plan: EditorState;
}

export const emptyMed = (): MedDraft => ({ name: "", strength: "", form: "tablet", timing: "", end_date: "", plan: toEditor(null) });

/** Draft from saved fields (or a scan). */
export function medDraft(m: { name: string; strength?: string | null; form?: string | null; timing?: string | null; end_date?: string | null; schedule?: Schedule | null; dosage?: string | null }): MedDraft {
  return {
    name: m.name,
    strength: m.strength ?? "",
    form: m.form ?? "tablet",
    timing: m.timing ?? "",
    end_date: m.end_date ?? "",
    plan: toEditor(m.schedule ?? null, m.dosage),
  };
}

/** API fields for a draft: the schedule when complete, else any legacy dosage text. */
export function medPayload(d: MedDraft) {
  const schedule = fromEditor(d.plan);
  const blank = (s: string) => s.trim() || null;
  return {
    name: d.name.trim(),
    strength: blank(d.strength),
    form: blank(d.form),
    timing: blank(d.timing),
    // Tapers end on their own; the server derives the end date from the schedule.
    end_date: d.plan.mode === "taper" ? null : blank(d.end_date),
    schedule,
    dosage: d.plan.mode === "text" ? blank(d.plan.text) : null,
  };
}

const TIMINGS = ["After food", "Before food", "With food", "Empty stomach", "At bedtime"];

/** The fields describing one medicine. Shared by the prescription and medicine forms. */
export function MedFields({ value, onChange, start }: { value: MedDraft; onChange: (v: MedDraft) => void; start?: string | null }) {
  const set = (k: Exclude<keyof MedDraft, "plan">) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <Field label="Medicine name" required>
        <Input value={value.name} onChange={set("name")} placeholder="e.g. Paracetamol" autoCapitalize="words" />
      </Field>
      <FieldRow>
        <Field label="Strength">
          <Input value={value.strength} onChange={set("strength")} placeholder="500 mg" />
        </Field>
        <Field label="Form">
          <NativeSelect value={value.form} onChange={set("form")}>
            {MED_FORMS.map((f) => (
              <NativeSelectOption key={f} value={f}>
                {capitalize(f)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldRow>
      <Field label="When to take" hint="With meals? The doses below are then shown as breakfast, lunch and dinner.">
        <Input value={value.timing} onChange={set("timing")} placeholder="After food" list="mv-timings" />
      </Field>
      <ScheduleEditor value={value.plan} onChange={(plan) => onChange({ ...value, plan })} timing={value.timing} form={value.form} start={start} />
      {value.plan.mode !== "taper" && (
        <Field label="Take until" hint="Leave empty if ongoing">
          <Input type="date" value={value.end_date} onChange={set("end_date")} />
        </Field>
      )}
      <datalist id="mv-timings">
        {TIMINGS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}
