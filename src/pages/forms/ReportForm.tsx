import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { REPORT_TYPES, type Report } from "@shared/types";
import { useReport, useSave, useUploadFiles } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { DoctorPicker } from "@/components/DoctorPicker";
import { ConditionPicker } from "@/components/ConditionPicker";
import { PhotoPicker } from "@/components/PhotoPicker";
import { FileGallery } from "@/components/FileGallery";
import { Loading } from "@/components/layout";
import { today } from "@/lib/format";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

export function ReportForm() {
  const { memberId: newFor, reportId } = useParams();
  const navigate = useNavigate();
  const existing = useReport(reportId);
  const save = useSave<Report>("reports");
  const upload = useUploadFiles();
  const [photos, setPhotos] = useState<File[]>([]);
  const f = useFields({ title: "", report_type: "blood", report_date: today(), lab_name: "", doctor_id: "", condition_id: "", notes: "" });
  useLoadRecord(existing.data, f);
  if (reportId && existing.isPending) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";

  return (
    <FormPage
      title="Report"
      heading={reportId ? "Edit report" : "Add a report"}
      submitLabel="Save report"
      onSubmit={async () => {
        const values = { ...f.values };
        if (!values.title.trim()) values.title = REPORT_TYPES.find((t) => t.value === values.report_type)?.label ?? "Report";
        const r = await save.mutateAsync({ id: reportId, data: { ...toPayload(values), member_id: memberId } });
        if (photos.length) await upload.mutateAsync({ ownerType: "report", ownerId: r.id, files: photos });
        toast.success("Report saved");
        navigate(`/reports/${r.id}`, { replace: true });
      }}
    >
      {existing.data && <FileGallery files={existing.data.files} />}
      <PhotoPicker files={photos} onChange={setPhotos} label={reportId ? "Add more pages" : "Photos or PDF of the report"} />
      <FieldRow>
        <Field label="Type">
          <NativeSelect {...f.bind("report_type")}>
            {REPORT_TYPES.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Report date" required>
          <Input type="date" {...f.bind("report_date")} max={today()} />
        </Field>
      </FieldRow>
      <Field label="Title" hint="e.g. CBC, Lipid profile, Knee X-ray. Defaults to the type.">
        <Input {...f.bind("title")} />
      </Field>
      <Field label="Lab / hospital">
        <Input {...f.bind("lab_name")} placeholder="e.g. Thyrocare" />
      </Field>
      <DoctorPicker value={f.values.doctor_id} onChange={(id) => f.set("doctor_id", id)} />
      <ConditionPicker memberId={memberId} value={f.values.condition_id} onChange={(id) => f.set("condition_id", id)} />
      <Field label="What it says" hint="Key findings in your words, e.g. ESR high (42), sugar normal">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
