import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useDelete, useMedication, useMedications, useMembers, useSave, useUploadFiles, type ScanResponse } from "@/api/hooks";
import { Copy } from "lucide-react";
import { fileUrl } from "@/api/client";
import { AiNotice, ScanButton } from "@/components/Scan";
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
import { ConditionsPicker, splitIds } from "@/components/ConditionsPicker";
import { PhotoPicker } from "@/components/PhotoPicker";
import { FileGallery } from "@/components/FileGallery";
import { Loading } from "@/components/layout";
import { today } from "@/lib/format";
import { toPayload } from "@/lib/useFields";
import { emptyMed, medDraft, medPayload, MedFields, type MedDraft } from "./MedFields";
import { scheduleOf } from "@shared/schedule";
import { ScheduleDetails } from "@/components/ScheduleDetails";
import { Badge } from "@/components/ui/badge";
import { medView, todayLine } from "@/lib/meds";
import type { Medication } from "@shared/types";

/**
 * Keyed by navigation: going from one medicine straight to another (or to a copy of it) renders the
 * same route element, which would otherwise keep the previous medicine's state.
 */
export function MedicationForm() {
  return <MedicationFormInner key={useLocation().key} />;
}

function MedicationFormInner() {
  const { memberId: newFor, medicationId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const existing = useMedication(medicationId);
  // "Copy to a family member": a new medicine for another person, filled from this one, saved only after review.
  const copyId = medicationId ? undefined : (search.get("copy") ?? undefined);
  const source = useMedication(copyId);
  const members = useMembers();
  const [copyOpen, setCopyOpen] = useState(false);
  const save = useSave<Medication>("medications");
  const del = useDelete("medications");
  const upload = useUploadFiles();

  const [med, setMed] = useState<MedDraft>(emptyMed());
  const [extra, setExtra] = useState({
    doctor_id: search.get("doctor_id") ?? "",
    condition_ids: search.get("condition_ids") ?? "",
    prescription_id: search.get("prescription_id") ?? "",
    start_date: today(),
    status: "active",
    notes: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [scanned, setScanned] = useState(false);

  const applyScan = (r: ScanResponse) => {
    if (r.kind !== "medicine") return;
    const d = r.data;
    setMed((m) => ({ ...m, name: d.name ?? m.name, strength: d.strength ?? m.strength, form: d.form ?? m.form }));
    if (d.notes) setExtra((x) => ({ ...x, notes: x.notes ? `${x.notes}\n${d.notes}` : d.notes! }));
    setScanned(true);
  };

  useEffect(() => {
    const m = existing.data;
    if (!m || loaded) return;
    const s = (v: string | null) => v ?? "";
    setMed(medDraft({ ...m, form: m.form ?? "other", schedule: scheduleOf(m) }));
    setExtra({ doctor_id: s(m.doctor_id), condition_ids: s(m.condition_ids ?? null), prescription_id: s(m.prescription_id), start_date: s(m.start_date), status: m.status, notes: s(m.notes) });
    setLoaded(true);
  }, [existing.data, loaded]);

  // A copy keeps the medicine, dose, timing, dates, doctor, notes and photos; not the conditions or prescription (they belong to the other person).
  const copied = useRef(false);
  useEffect(() => {
    const m = source.data;
    if (!m || copied.current) return;
    copied.current = true;
    // Same course: start and end dates carry over (editable before saving).
    setMed(medDraft({ ...m, form: m.form ?? "other", schedule: scheduleOf(m) }));
    setExtra((x) => ({ ...x, doctor_id: m.doctor_id ?? "", notes: m.notes ?? "", start_date: m.start_date ?? today(), status: "active" }));
    setLoaded(true);
    api
      .get<FileMeta[]>(`/files?owner_type=medication&owner_id=${m.id}`)
      .then((files) =>
        Promise.all(
          files
            .filter((f) => f.mime_type.startsWith("image/"))
            .map(async (f) => new File([await (await fetch(fileUrl(f.id))).blob()], f.name ?? "medicine.jpg", { type: f.mime_type })),
        ),
      )
      .then((files) => files.length && setPhotos((p) => [...files, ...p]))
      .catch(() => {}); // the copy still works without the photo
  }, [source.data]);

  if ((medicationId && existing.isPending) || (copyId && source.isPending)) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";
  const people = members.data ?? [];
  const sourceOwner = people.find((p) => p.id === source.data?.member_id)?.name;
  const target = people.find((p) => p.id === memberId)?.name;
  const done = (id: string) => navigate(extra.prescription_id ? `/prescriptions/${extra.prescription_id}` : `/m/${memberId}/medicines`, { replace: true, state: { id } });

  const stop = () => setExtra((x) => ({ ...x, status: "stopped" }));

  return (
    <FormPage
      title="Medicine"
      heading={medicationId ? med.name || "Medicine" : copyId ? `Copy for ${target ?? "family member"}` : "Add a medicine"}
      onSubmit={async () => {
        if (!med.name.trim()) throw new Error("Medicine name is required");
        const data: Record<string, unknown> = { ...toPayload(extra), condition_ids: splitIds(extra.condition_ids), ...medPayload(med), member_id: memberId };
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
            {people.length > 1 && (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setCopyOpen((o) => !o)} aria-expanded={copyOpen} className="flex h-12 items-center justify-center gap-2 rounded-sm border border-rule bg-sheet type-label text-ink">
                  <Copy className="size-4" /> Copy to a family member
                </button>
                {copyOpen && (
                  <div className="flex flex-col gap-2 rounded-sm border border-rule bg-sheet p-3" role="group" aria-label="Copy to">
                    <p className="type-caption text-ink-faint">Opens a new medicine for them with the same details. Change the dose if theirs is different, then save.</p>
                    {people
                      .filter((p) => p.id !== memberId)
                      .map((p) => (
                        <Link key={p.id} to={`/m/${p.id}/medications/new?copy=${medicationId}`} className="flex h-11 items-center rounded-sm border border-rule px-3 type-label text-ink hover:border-iris">
                          {p.name}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            )}
            <ConfirmDelete what="this medicine" detail="Use 'Stopped' instead if you want to keep it in history." onConfirm={async () => (await del.mutateAsync(medicationId), done(""))} />
          </div>
        )
      }
    >
      {source.data && <CopyNotice memberId={memberId} name={med.name} from={sourceOwner} to={target} />}
      {existing.data && <SavedSchedule med={existing.data} />}
      {medicationId && existing.data?.status === "active" && extra.status === "active" && (
        <button type="button" onClick={stop} className="h-12 rounded-sm border border-rule bg-sheet type-label text-ink">
          Mark as stopped
        </button>
      )}
      {!medicationId && !copyId && (
        <>
          <ScanButton kind="medicine" photos={photos} onPhoto={(file) => setPhotos((p) => [...p, file])} onResult={applyScan} />
          {scanned && <AiNotice>Dosage and timing are not on the strip: add them from the prescription.</AiNotice>}
        </>
      )}
      <MedFields value={med} onChange={setMed} start={extra.start_date || null} />
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
      <ConditionsPicker memberId={memberId} value={splitIds(extra.condition_ids)} onChange={(ids) => setExtra({ ...extra, condition_ids: ids.join(",") })} />
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

/** "How to take" card for a saved medicine: today's dose first, then the full schedule. */
function SavedSchedule({ med }: { med: Medication }) {
  const v = medView(med);
  if (!v.schedule) return null;
  const line = todayLine(v);
  return (
    <div className="rounded-sm border border-rule bg-sheet p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="meta text-ink-faint">How to take</span>
        {v.weekly && <Badge variant="warn">Weekly</Badge>}
        {v.taper && <Badge>Changing dose</Badge>}
      </div>
      {line && v.current && <p className="mb-3 type-body font-semibold">{line}</p>}
      <ScheduleDetails schedule={v.schedule} start={med.start_date} timing={med.timing} form={med.form} />
    </div>
  );
}

/** Shown on a copied medicine: where it came from, and whether this person already has it. */
function CopyNotice({ memberId, name, from, to }: { memberId: string; name: string; from?: string; to?: string }) {
  const meds = useMedications(memberId);
  const key = name.trim().toLowerCase().split(/\s+/)[0];
  const already = key && meds.data?.find((m) => m.status === "active" && m.name.toLowerCase().split(/\s+/)[0] === key);
  return (
    <div className="rounded-sm border border-iris bg-iris-surface p-4 type-label text-ink" role="status">
      <div className="meta mb-1 text-iris">Copied{from ? ` from ${from}` : ""}</div>
      Check the strength, dose and timing for {to ?? "this person"} before saving. Nothing is saved until you tap Save.
      {already && (
        <div className="mt-2 font-semibold text-rust">
          {to ?? "They"} already take{to ? "s" : ""} {already.name}.{" "}
          <Link to={`/medications/${already.id}`} className="font-normal text-iris underline">
            Open it
          </Link>
        </div>
      )}
    </div>
  );
}
