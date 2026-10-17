import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { REPORT_TYPES, type Report } from "@shared/types";
import { joinReportTypes, reportTypeLabel, reportTypes, type DuplicateMatch } from "@shared/reports";
import { findReportDuplicates, saveLabValues, useReport, useSave, useUploadFiles, type ScanResponse } from "@/api/hooks";
import type { LabDraft } from "@shared/types";
import { LabValuesEditor } from "@/components/LabValuesEditor";
import { useQueryClient } from "@tanstack/react-query";
import { AiNotice, ScanButton } from "@/components/Scan";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { DoctorPicker } from "@/components/DoctorPicker";
import { ConditionsPicker, splitIds } from "@/components/ConditionsPicker";
import { PhotoPicker } from "@/components/PhotoPicker";
import { FileGallery } from "@/components/FileGallery";
import { Loading } from "@/components/layout";
import { formatDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

export function ReportForm() {
  const { memberId: newFor, reportId } = useParams();
  const navigate = useNavigate();
  const existing = useReport(reportId);
  const save = useSave<Report>("reports");
  const upload = useUploadFiles();
  const [photos, setPhotos] = useState<File[]>([]);
  const f = useFields({ title: "", report_type: "blood", report_date: today(), lab_name: "", doctor_id: "", condition_ids: "", notes: "" });
  const [scanned, setScanned] = useState(false);
  const [labs, setLabs] = useState<LabDraft[] | null>(null);
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const saveAnyway = useRef(false);
  const dupRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useLoadRecord(existing.data, f);
  // Edit: start from the saved results.
  const rows: LabDraft[] = labs ?? existing.data?.values.map((v) => ({ test_name: v.test_name, value_text: v.value_text, unit: v.unit, ref_text: v.ref_text })) ?? [];
  if (reportId && existing.isPending) return <Loading />;

  const applyScan = (r: ScanResponse) => {
    if (r.kind !== "report") return;
    const d = r.data;
    if (d.title) f.set("title", d.title);
    if (d.report_type) f.set("report_type", d.report_type);
    if (d.report_date) f.set("report_date", d.report_date);
    if (d.lab_name) f.set("lab_name", d.lab_name);
    if (d.findings) f.set("notes", f.values.notes ? `${f.values.notes}\n${d.findings}` : d.findings);
    if (d.values.length) setLabs([...rows.filter((r) => r.test_name.trim()), ...d.values]);
    setScanned(true);
  };
  const memberId = newFor ?? existing.data?.member_id ?? "";

  return (
    <FormPage
      title="Report"
      heading={reportId ? "Edit report" : "Add a report"}
      submitLabel="Save report"
      onSubmit={async () => {
        const values = { ...f.values, report_type: joinReportTypes(reportTypes(f.values.report_type)) };
        if (!values.title.trim()) values.title = reportTypeLabel(values.report_type);
        // A new report that looks already saved (scanned twice, or its photo and its PDF): ask first.
        if (!reportId && !saveAnyway.current) {
          const found = await findReportDuplicates({ member_id: memberId, report_date: values.report_date, report_type: values.report_type, values: rows.filter((r) => r.test_name.trim()) });
          if (found.length) {
            setDupes(found);
            requestAnimationFrame(() => dupRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
            return;
          }
        }
        const r = await save.mutateAsync({ id: reportId, data: { ...toPayload(values), condition_ids: splitIds(values.condition_ids), member_id: memberId } });
        if (labs !== null) {
          await saveLabValues(r.id, labs);
          await qc.invalidateQueries();
        }
        if (photos.length) await upload.mutateAsync({ ownerType: "report", ownerId: r.id, files: photos });
        toast.success("Report saved");
        navigate(`/reports/${r.id}`, { replace: true });
      }}
    >
      {existing.data && <FileGallery files={existing.data.files} />}
      <PhotoPicker files={photos} onChange={setPhotos} label={reportId ? "Add more pages" : "Photos or PDF of the report"} />
      {!reportId && <ScanButton kind="report" photos={photos} onPhoto={(file) => setPhotos((p) => [...p, file])} onResult={applyScan} />}
      {scanned && <AiNotice>Values marked as findings are a summary. The photo stays the source of truth.</AiNotice>}
      <Field label="Tests in this report" hint="Pick every test it has, e.g. blood and urine. It stays one report and shows under each type.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tests in this report">
          {REPORT_TYPES.map((t) => {
            const chosen = reportTypes(f.values.report_type);
            const on = chosen.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => f.set("report_type", joinReportTypes(on ? chosen.filter((x) => x !== t.value) : t.value === "other" ? ["other"] : [...chosen.filter((x) => x !== "other"), t.value]))}
                className={cn("flex h-10 items-center gap-1.5 rounded-sm border px-3 type-label", on ? "border-iris bg-iris-surface text-ink" : "border-rule bg-sheet text-ink-muted")}
              >
                {on && <Check className="size-4 text-iris" />}
                {t.label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Report date" required>
        <Input type="date" {...f.bind("report_date")} max={today()} />
      </Field>
      <Field label="Title" hint="e.g. CBC, Lipid profile, Knee X-ray. Defaults to the type.">
        <Input {...f.bind("title")} />
      </Field>
      <Field label="Lab / hospital">
        <Input {...f.bind("lab_name")} placeholder="e.g. Thyrocare" />
      </Field>
      <DoctorPicker value={f.values.doctor_id} onChange={(id) => f.set("doctor_id", id)} />
      <ConditionsPicker memberId={memberId} value={splitIds(f.values.condition_ids)} onChange={(ids) => f.set("condition_ids", ids.join(","))} />
      <Field label="What it says" hint="Key findings in your words, e.g. ESR high (42), sugar normal">
        <Textarea {...f.bind("notes")} />
      </Field>
      <LabValuesEditor value={rows} onChange={setLabs} />
      {dupes.length > 0 && (
        <div ref={dupRef} className="flex flex-col gap-3 rounded-sm border border-rust bg-rust-surface p-4 type-label text-ink" role="alert">
          <p className="font-semibold">This report looks already saved</p>
          <ul className="flex flex-col gap-1">
            {dupes.slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link to={`/reports/${d.id}`} className="text-iris underline">
                  {d.title}, {formatDate(d.report_date)}
                  {d.lab_name ? `, ${d.lab_name}` : ""}
                </Link>
                <span className="text-ink-muted">{d.reason === "same-results" ? ` · ${d.matched} results the same` : " · same date and type"}</span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">Saving again would show each result twice in the trends. Open the saved one to add these pages to it, or save anyway if it is a different report.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(`/reports/${dupes[0].id}`)}>
              Open saved
            </Button>
            <Button type="submit" variant="ghost" onClick={() => (saveAnyway.current = true)}>
              Save anyway
            </Button>
          </div>
        </div>
      )}
    </FormPage>
  );
}
