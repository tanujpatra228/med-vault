import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { Condition } from "@shared/types";
import { useCondition, useDelete, useSave } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Loading } from "@/components/layout";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

export function ConditionForm() {
  const { memberId: newFor, conditionId } = useParams();
  const navigate = useNavigate();
  const existing = useCondition(conditionId);
  const save = useSave<Condition>("conditions");
  const del = useDelete("conditions");
  const f = useFields({ name: "", status: "active", diagnosed_on: "", notes: "" });
  useLoadRecord(existing.data, f);
  if (conditionId && existing.isPending) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";
  const back = () => navigate(`/m/${memberId}/health`, { replace: true });

  return (
    <FormPage
      title="Health condition"
      heading={conditionId ? "Edit condition" : "Add a health condition"}
      onSubmit={async () => {
        if (!f.values.name.trim()) throw new Error("Condition name is required");
        await save.mutateAsync({ id: conditionId, data: { ...toPayload(f.values), member_id: memberId } });
        toast.success("Condition saved");
        back();
      }}
      footer={
        conditionId && (
          <ConfirmDelete
            what="this condition"
            detail="Prescriptions, medicines and reports linked to it are kept, just unlinked."
            onConfirm={async () => (await del.mutateAsync(conditionId), back())}
          />
        )
      }
    >
      <Field label="Condition" required>
        <Input {...f.bind("name")} placeholder="e.g. Arthritis, eye infection, diabetes" />
      </Field>
      <FieldRow>
        <Field label="Status">
          <NativeSelect {...f.bind("status")}>
            <NativeSelectOption value="active">Active</NativeSelectOption>
            <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field label="Diagnosed on">
          <Input type="date" {...f.bind("diagnosed_on")} />
        </Field>
      </FieldRow>
      <Field label="Notes" hint="e.g. Linked to arthritis, referred by the eye doctor">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
