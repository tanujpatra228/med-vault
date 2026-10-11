import { MED_FORMS } from "@shared/types";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { capitalize } from "@/lib/format";

export interface MedDraft {
  name: string;
  strength: string;
  form: string;
  dosage: string;
  timing: string;
  end_date: string;
}

export const emptyMed = (): MedDraft => ({ name: "", strength: "", form: "tablet", dosage: "", timing: "", end_date: "" });

const DOSAGES = ["1-0-0", "0-0-1", "1-0-1", "1-1-1", "0-1-0", "As needed"];
const TIMINGS = ["After food", "Before food", "With food", "Empty stomach", "At bedtime"];

/** The fields describing one medicine. Shared by the prescription and medicine forms. */
export function MedFields({ value, onChange }: { value: MedDraft; onChange: (v: MedDraft) => void }) {
  const set = (k: keyof MedDraft) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
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
      <Field label="Dosage" hint="Morning-afternoon-night, e.g. 1-0-1">
        <Input value={value.dosage} onChange={set("dosage")} placeholder="1-0-1" list="mv-dosages" className="num" />
      </Field>
      <Field label="When to take">
        <Input value={value.timing} onChange={set("timing")} placeholder="After food" list="mv-timings" />
      </Field>
      <Field label="Take until" hint="Leave empty if ongoing">
        <Input type="date" value={value.end_date} onChange={set("end_date")} />
      </Field>
      <datalist id="mv-dosages">
        {DOSAGES.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <datalist id="mv-timings">
        {TIMINGS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}
