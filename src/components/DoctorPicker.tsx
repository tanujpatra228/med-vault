import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Doctor } from "@shared/types";
import { useDoctors, useSave } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { sameName } from "@/lib/format";

const NEW = "__new__";

export interface DoctorSuggestion {
  name: string;
  specialty: string | null;
}

/**
 * Pick an existing doctor or add one inline without leaving the form.
 * A `suggestion` (e.g. read by AI) selects a matching doctor, or opens "new doctor" prefilled.
 */
export function DoctorPicker({
  value,
  onChange,
  suggestion,
  onDismissSuggestion,
}: {
  value: string;
  onChange: (id: string) => void;
  suggestion?: DoctorSuggestion | null;
  /** Called when the user cancels a suggested new doctor. */
  onDismissSuggestion?: () => void;
}) {
  const doctors = useDoctors();
  const save = useSave<Doctor>("doctors");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");

  useEffect(() => {
    if (!suggestion || !doctors.data) return;
    const match = doctors.data.find((d) => sameName(d.name, suggestion.name));
    if (match) {
      onChange(match.id);
      setAdding(false);
    } else {
      setName(suggestion.name);
      setSpecialty(suggestion.specialty ?? "");
      setAdding(true);
    }
    // Only react to a new suggestion, not to every doctors refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion, doctors.isSuccess]);

  const create = async () => {
    if (!name.trim()) return toast.error("Doctor's name is required");
    try {
      const d = await save.mutateAsync({ data: { name, specialty } });
      onChange(d.id);
      setAdding(false);
      setName("");
      setSpecialty("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add doctor");
    }
  };

  if (adding)
    return (
      <div className="flex flex-col gap-3 rounded-sm border border-rule bg-paper p-3">
        <div className="type-label text-ink-muted">New doctor</div>
        <FieldRow>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Mehta" autoFocus />
          </Field>
          <Field label="Specialty">
            <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Eye" />
          </Field>
        </FieldRow>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => (setAdding(false), onDismissSuggestion?.())}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={save.isPending}>
            Add doctor
          </Button>
        </div>
      </div>
    );

  return (
    <Field label="Doctor">
      <NativeSelect value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}>
        <NativeSelectOption value="">No doctor / self</NativeSelectOption>
        {doctors.data?.map((d) => (
          <NativeSelectOption key={d.id} value={d.id}>
            {d.name}
            {d.specialty ? ` (${d.specialty})` : ""}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NEW}>+ Add a new doctor</NativeSelectOption>
      </NativeSelect>
    </Field>
  );
}
