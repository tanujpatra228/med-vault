import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { Member } from "@shared/types";
import { uploadFile, useDelete, useMember, useSave } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Loading } from "@/components/layout";
import { Tile } from "@/components/Row";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function MemberForm() {
  const { memberId } = useParams();
  const editing = !!memberId;
  const navigate = useNavigate();
  const existing = useMember(memberId);
  const save = useSave<Member>("members");
  const del = useDelete("members");
  const [photo, setPhoto] = useState<File | null>(null);
  const f = useFields({ name: "", relation: "", dob: "", sex: "", blood_group: "", notes: "" });
  useLoadRecord(editing ? existing.data : undefined, f);

  if (editing && existing.isPending) return <Loading />;

  const submit = async () => {
    if (!f.values.name.trim()) throw new Error("Name is required");
    const m = await save.mutateAsync({ id: memberId, data: toPayload(f.values) });
    if (photo) await uploadFile("member", m.id, photo);
    toast.success(editing ? "Saved" : `${m.name} added`);
    navigate(`/m/${m.id}`, { replace: true });
  };

  return (
    <FormPage
      title={editing ? "Edit profile" : "New family member"}
      heading={editing ? "Edit profile" : "Add a family member"}
      onSubmit={submit}
      submitLabel={editing ? "Save changes" : "Add family member"}
      footer={
        editing && (
          <ConfirmDelete
            what={existing.data?.name ?? "member"}
            detail="All their medicines, prescriptions, reports, allergies, conditions and photos will be deleted. This cannot be undone."
            onConfirm={async () => {
              await del.mutateAsync(memberId!);
              navigate("/", { replace: true });
            }}
          />
        )
      }
    >
      <div className="flex items-center gap-4">
        {photo ? (
          <img src={URL.createObjectURL(photo)} alt="" className="size-16 rounded-md object-cover" />
        ) : (
          <Tile label={f.values.name || "?"} photoId={existing.data?.photo_file_id} className="size-16" />
        )}
        <Button type="button" variant="secondary" asChild>
          <label>
            {existing.data?.photo_file_id || photo ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
        </Button>
      </div>
      <Field label="Name" required>
        <Input {...f.bind("name")} placeholder="e.g. Maa" autoComplete="off" />
      </Field>
      <Field label="Relation" hint="How you call them, e.g. Mother, Father, Self">
        <Input {...f.bind("relation")} placeholder="Mother" />
      </Field>
      <FieldRow>
        <Field label="Date of birth">
          <Input type="date" {...f.bind("dob")} />
        </Field>
        <Field label="Sex">
          <NativeSelect {...f.bind("sex")}>
            <NativeSelectOption value="">Not set</NativeSelectOption>
            <NativeSelectOption value="female">Female</NativeSelectOption>
            <NativeSelectOption value="male">Male</NativeSelectOption>
            <NativeSelectOption value="other">Other</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FieldRow>
      <Field label="Blood group">
        <NativeSelect {...f.bind("blood_group")}>
          <NativeSelectOption value="">Not known</NativeSelectOption>
          {BLOOD.map((b) => (
            <NativeSelectOption key={b} value={b}>
              {b}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Notes" hint="Anything a doctor should know: surgeries, implants, habits">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
