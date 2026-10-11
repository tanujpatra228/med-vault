import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { Medication } from "@shared/types";
import { useDelete, useMedication, useSave, useUploadFiles } from "@/api/hooks";
import { api } from "@/api/client";
import { useQuery } from "@tanstack/react-query";
import type { FileMeta } from "@shared/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { DoctorPicker } from "@/components/DoctorPicker";
import { ConditionPicker } from "@/components/ConditionPicker";
import { PhotoPicker } from "@/components/PhotoPicker";
import { FileGallery } from "@/components/FileGallery";
import { Loading } from "@/components/layout";
import { today } from "@/lib/format";
import { toPayload } from "@/lib/useFields";
import { emptyMed, MedFields, type MedDraft } from "./MedFields";

export function MedicationForm() {
  const { memberId: newFor, medicationId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const existing = useMedication(medicationId);
  const save = useSave<Medication>("medications");
  const del = useDelete("medications");
  const upload = useUploadFiles();

  const [med, setMed] = useState<MedDraft>(emptyMed());
  const [extra, setExtra] = useState({
    doctor_id: search.get("doctor_id") ?? "",
    condition_id: search.get("condition_id") ?? "",
    prescription_id: search.get("prescription_id") ?? "",
    start_date: today(),
    status: "active",
    notes: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const m = existing.data;
    if (!m || loaded) return;
    const s = (v: string | null) => v ?? "";
    setMed({ name: m.name, strength: s(m.strength), form: s(m.form) || "other", dosage: s(m.dosage), timing: s(m.timing), end_date: s(m.end_date) });
    setExtra({ doctor_id: s(m.doctor_id), condition_id: s(m.condition_id), prescription_id: s(m.prescription_id), start_date: s(m.start_date), status: m.status, notes: s(m.notes) });
    setLoaded(true);
  }, [existing.data, loaded]);

  if (medicationId && existing.isPending) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";
  const done = (id: string) => navigate(extra.prescription_id ? `/prescriptions/${extra.prescription_id}` : `/m/${memberId}/medicines`, { replace: true, state: { id } });

  const stop = () => setExtra((x) => ({ ...x, status: "stopped" }));

  return (
    <FormPage
      title="Medicine"
      heading={medicationId ? med.name || "Medicine" : "Add a medicine"}
      onSubmit={async () => {
        if (!med.name.trim()) throw new Error("Medicine name is required");
        const data: Record<string, string | null> = { ...toPayload({ ...med, ...extra }), member_id: memberId };
        if (data.status === "stopped" && !data.end_date) data.end_date = today();
        const saved = await save.mutateAsync({ id: medicationId, data });
        if (photos.length) await upload.mutateAsync({ ownerType: "medication", ownerId: saved.id, files: photos });
        toast.success("Medicine saved");
        done(saved.id);
      }}
      footer={
        medicationId && (
          <div className="flex flex-col gap-3">
            {existing.data?.prescription_id && (
              <Link to={`/prescriptions/${existing.data.prescription_id}`} className="type-label text-iris hover:underline">
                View the prescription this came from
              </Link>
            )}
            <ConfirmDelete what="this medicine" detail="Use 'Stopped' instead if you want to keep it in history." onConfirm={async () => (await del.mutateAsync(medicationId), done(""))} />
          </div>
        )
      }
    >
      {medicationId && existing.data?.status === "active" && extra.status === "active" && (
        <button type="button" onClick={stop} className="h-12 rounded-sm border border-rule bg-sheet type-label text-ink">
          Mark as stopped
        </button>
      )}
      <MedFields value={med} onChange={setMed} />
      <FieldRow>
        <Field label="Started on">
          <Input type="date" value={extra.start_date} onChange={(e) => setExtra({ ...extra, start_date: e.target.value })} />
        </Field>
        <Field label="Status">
          <NativeSelect value={extra.status} onChange={(e) => setExtra({ ...extra, status: e.target.value })}>
            <NativeSelectOption value="active">Taking</NativeSelectOption>
            <NativeSelectOption value="stopped">Stopped</NativeSelectOption>
          </NativeSelect>
        </Field>
      </FieldRow>
      {!extra.prescription_id && <DoctorPicker value={extra.doctor_id} onChange={(id) => setExtra({ ...extra, doctor_id: id })} />}
      <ConditionPicker memberId={memberId} value={extra.condition_id} onChange={(id) => setExtra({ ...extra, condition_id: id })} />
      <Field label="Notes" hint="e.g. side effects, reason for stopping">
        <Textarea value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} />
      </Field>
      <PhotoPicker files={photos} onChange={setPhotos} label="Photo of the medicine (strip or box)" />
      {medicationId && <MedicationFiles id={medicationId} />}
    </FormPage>
  );
}

function MedicationFiles({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["files", "medication", id], queryFn: () => api.get<FileMeta[]>(`/files?owner_type=medication&owner_id=${id}`) });
  return q.data?.length ? <FileGallery files={q.data} /> : null;
}
