import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useCreatePrescription, usePrescription, useSave, useUploadFiles, type ScanResponse } from "@/api/hooks";
import type { Prescription } from "@shared/types";
import { AiNotice, ScanButton } from "@/components/Scan";
import { OtherDiagnoses } from "@/components/OtherDiagnoses";
import type { DoctorSuggestion } from "@/components/DoctorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { DoctorPicker } from "@/components/DoctorPicker";
import { ConditionPicker } from "@/components/ConditionPicker";
import { PhotoPicker } from "@/components/PhotoPicker";
import { FollowUpField } from "@/components/FollowUpField";
import { FileGallery } from "@/components/FileGallery";
import { Eyebrow, Loading } from "@/components/layout";
import { addDays, today } from "@/lib/format";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";
import { emptyMed, medDraft, medPayload, MedFields, type MedDraft } from "./MedFields";
import { totalDays } from "@shared/schedule";

/** New prescription: photos, doctor, date and every medicine on it, saved in one go. */
export function PrescriptionNew() {
  const { memberId = "" } = useParams();
  const navigate = useNavigate();
  const create = useCreatePrescription();
  const upload = useUploadFiles();
  const f = useFields({ doctor_id: "", condition_id: "", prescribed_on: today(), notes: "", follow_up_on: "", follow_up_note: "" });
  const [followUpText, setFollowUpText] = useState<string | null>(null);
  const [meds, setMeds] = useState<MedDraft[]>([emptyMed()]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [scanned, setScanned] = useState(false);
  const [doctorHint, setDoctorHint] = useState<DoctorSuggestion | null>(null);
  const [conditionHint, setConditionHint] = useState<string | null>(null);
  const [otherDiagnoses, setOtherDiagnoses] = useState<string[]>([]);

  // AI fills what it could read; everything stays editable and nothing is saved until "Save".
  const applyScan = (r: ScanResponse) => {
    if (r.kind !== "prescription") return;
    const d = r.data;
    const date = d.prescribed_on ?? f.values.prescribed_on;
    if (d.prescribed_on) f.set("prescribed_on", d.prescribed_on);
    if (d.notes) f.set("notes", f.values.notes ? `${f.values.notes}\n${d.notes}` : d.notes);
    if (d.follow_up_on) f.set("follow_up_on", d.follow_up_on);
    setFollowUpText(d.follow_up_text);
    if (d.doctor_name) setDoctorHint({ name: d.doctor_name, specialty: d.doctor_specialty });
    if (d.condition) setConditionHint(d.condition);
    setOtherDiagnoses(d.conditions.slice(1));
    if (d.medications.length) {
      const read: MedDraft[] = d.medications.map((m) =>
        medDraft({
          ...m,
          form: m.form ?? "tablet",
          // A fixed-length schedule (taper) carries its own end; otherwise use the written duration.
          end_date: m.duration_days && !(m.schedule && totalDays(m.schedule)) ? addDays(date, m.duration_days - 1) : null,
        }),
      );
      setMeds((current) => [...current.filter((m) => m.name.trim()), ...read]);
    }
    setScanned(true);
  };

  const submit = async () => {
    // An AI-suggested doctor/condition waiting in its "add new" box would otherwise be silently dropped.
    if (doctorHint && !f.values.doctor_id) throw new Error(`Tap "Add doctor" to keep ${doctorHint.name}, or "Cancel" to skip`);
    if (conditionHint && !f.values.condition_id) throw new Error(`Tap "Add condition" to keep ${conditionHint}, or "Cancel" to skip`);
    const filled = meds.filter((m) => m.name.trim());
    if (!filled.length && !photos.length) throw new Error("Add a photo or at least one medicine");
    const p = await create.mutateAsync({
      member_id: memberId,
      ...(toPayload(f.values) as { prescribed_on: string }),
      medications: filled.map(medPayload),
    });
    if (photos.length) {
      try {
        await upload.mutateAsync({ ownerType: "prescription", ownerId: p.id, files: photos });
      } catch (e) {
        toast.error(`Saved, but photos failed to upload: ${e instanceof Error ? e.message : ""}`);
      }
    }
    toast.success(`Prescription saved with ${filled.length} ${filled.length === 1 ? "medicine" : "medicines"}`);
    navigate(`/prescriptions/${p.id}`, { replace: true });
  };

  return (
    <FormPage title="New prescription" heading="Add a prescription" onSubmit={submit} submitLabel="Save prescription">
      <PhotoPicker files={photos} onChange={setPhotos} label="Photo of the prescription" />
      <ScanButton kind="prescription" photos={photos} onPhoto={(file) => setPhotos((p) => [...p, file])} onResult={applyScan} />
      {scanned && <AiNotice />}
      <DoctorPicker value={f.values.doctor_id} onChange={(id) => f.set("doctor_id", id)} suggestion={doctorHint} onDismissSuggestion={() => setDoctorHint(null)} />
      <Field label="Date on prescription" required>
        <Input type="date" {...f.bind("prescribed_on")} max={today()} />
      </Field>
      <ConditionPicker memberId={memberId} value={f.values.condition_id} onChange={(id) => f.set("condition_id", id)} suggestion={conditionHint} onDismissSuggestion={() => setConditionHint(null)} />
      <OtherDiagnoses memberId={memberId} names={otherDiagnoses} />

      <div className="mt-4 border-t border-rule pt-5">
        <Eyebrow className="mb-4">Medicines on this prescription · {meds.filter((m) => m.name.trim()).length}</Eyebrow>
        <div className="flex flex-col gap-4">
          {meds.map((m, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-sm border border-rule bg-sheet p-4">
              <div className="flex items-center justify-between">
                <span className="type-label text-ink-muted">Medicine {i + 1}</span>
                {meds.length > 1 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove medicine ${i + 1}`} onClick={() => setMeds(meds.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                )}
              </div>
              {m.scan && <ScanCheck scan={m.scan} />}
              <MedFields value={m} start={f.values.prescribed_on || null} onChange={(v) => setMeds(meds.map((x, j) => (j === i ? v : x)))} />
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setMeds([...meds, emptyMed()])}>
            <Plus /> Add another medicine
          </Button>
        </div>
      </div>

      <Field label="Doctor's advice / notes" hint="e.g. Avoid cold drinks, tests advised">
        <Textarea {...f.bind("notes")} />
      </Field>
      <FollowUpField
        from={f.values.prescribed_on}
        date={f.values.follow_up_on}
        note={f.values.follow_up_note}
        onDate={(d) => f.set("follow_up_on", d)}
        onNote={(n) => f.set("follow_up_note", n)}
        writtenAs={followUpText}
      />
    </FormPage>
  );
}

/** Edit the prescription's own details and add more photos. Medicines are edited one by one. */
export function PrescriptionEdit() {
  const { prescriptionId } = useParams();
  const navigate = useNavigate();
  const existing = usePrescription(prescriptionId);
  const save = useSave<Prescription>("prescriptions");
  const upload = useUploadFiles();
  const f = useFields({ doctor_id: "", condition_id: "", prescribed_on: "", notes: "" });
  const [photos, setPhotos] = useState<File[]>([]);
  useLoadRecord(existing.data, f);
  if (existing.isPending) return <Loading />;
  const p = existing.data;
  if (!p) return null;

  return (
    <FormPage
      title="Edit prescription"
      heading="Edit prescription"
      onSubmit={async () => {
        await save.mutateAsync({ id: p.id, data: toPayload(f.values) });
        if (photos.length) await upload.mutateAsync({ ownerType: "prescription", ownerId: p.id, files: photos });
        toast.success("Saved");
        navigate(`/prescriptions/${p.id}`, { replace: true });
      }}
    >
      <FileGallery files={p.files} />
      <PhotoPicker files={photos} onChange={setPhotos} label="Add more photos" />
      <DoctorPicker value={f.values.doctor_id} onChange={(id) => f.set("doctor_id", id)} />
      <Field label="Date on prescription" required>
        <Input type="date" {...f.bind("prescribed_on")} />
      </Field>
      <ConditionPicker memberId={p.member_id} value={f.values.condition_id} onChange={(id) => f.set("condition_id", id)} />
      <Field label="Doctor's advice / notes">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}

/** What the prescription says for this medicine, and anything the scan found suspicious. */
function ScanCheck({ scan }: { scan: NonNullable<MedDraft["scan"]> }) {
  if (!scan.doseText && !scan.warnings.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {scan.doseText && (
        <p className="rounded-sm border border-rule bg-paper px-3 py-2 type-label text-ink-muted">
          <span className="meta mr-2 text-ink-faint">Written</span>
          <span className="text-ink">{scan.doseText}</span>
        </p>
      )}
      {scan.warnings.map((w) => (
        <p key={w} className="rounded-sm border border-rust bg-rust-surface px-3 py-2 type-label text-rust" role="alert">
          {w}
        </p>
      ))}
    </div>
  );
}
