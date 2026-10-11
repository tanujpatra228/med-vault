import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { Allergy } from "@shared/types";
import { useAllergy, useDelete, useSave } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Loading } from "@/components/layout";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

export function AllergyForm() {
  const { memberId: newFor, allergyId } = useParams();
  const navigate = useNavigate();
  const existing = useAllergy(allergyId);
  const save = useSave<Allergy>("allergies");
  const del = useDelete("allergies");
  const f = useFields({ allergen: "", kind: "drug", reaction: "", severity: "moderate", noted_on: "", notes: "" });
  useLoadRecord(existing.data, f);
  if (allergyId && existing.isPending) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";
  const back = () => navigate(`/m/${memberId}/health`, { replace: true });

  return (
    <FormPage
      title="Allergy"
      heading={allergyId ? "Edit allergy" : "Add an allergy"}
      onSubmit={async () => {
        if (!f.values.allergen.trim()) throw new Error("What are they allergic to?");
        await save.mutateAsync({ id: allergyId, data: { ...toPayload(f.values), member_id: memberId } });
        toast.success("Allergy saved");
        back();
      }}
      footer={allergyId && <ConfirmDelete what="this allergy" onConfirm={async () => (await del.mutateAsync(allergyId), back())} />}
    >
      <Field label="Allergic to" required>
        <Input {...f.bind("allergen")} placeholder="e.g. Penicillin, peanuts" />
      </Field>
      <FieldRow>
        <Field label="Type">
          <NativeSelect {...f.bind("kind")}>
            <NativeSelectOption value="drug">Medicine</NativeSelectOption>
            <NativeSelectOption value="food">Food</NativeSelectOption>
            <NativeSelectOption value="other">Other</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Severity">
          <NativeSelect {...f.bind("severity")}>
            <NativeSelectOption value="mild">Mild</NativeSelectOption>
            <NativeSelectOption value="moderate">Moderate</NativeSelectOption>
            <NativeSelectOption value="severe">Severe</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FieldRow>
      <Field label="Reaction" hint="What happens, e.g. rash, swelling, breathing trouble">
        <Input {...f.bind("reaction")} />
      </Field>
      <Field label="Noticed on">
        <Input type="date" {...f.bind("noted_on")} />
      </Field>
      <Field label="Notes">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
