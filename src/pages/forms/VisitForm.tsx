import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { CalendarCheck, FileText } from "lucide-react";
import type { Visit } from "@shared/types";
import { useDelete, useSave, useVisit } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { DoctorPicker } from "@/components/DoctorPicker";
import { ConditionsPicker, splitIds } from "@/components/ConditionsPicker";
import { FollowUpField } from "@/components/FollowUpField";
import { daysUntil } from "@/components/FollowUps";
import { Loading } from "@/components/layout";
import { formatDate, today } from "@/lib/format";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

/**
 * Log or edit a visit. `?doctor=<id>` pre-selects the doctor (from "Log the visit" on a follow-up).
 * Keyed by location: going from a visit straight to a new one must start with a fresh form.
 */
export function VisitForm() {
  return <VisitFormInner key={useLocation().key} />;
}

function VisitFormInner() {
  const { memberId: newFor, visitId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useVisit(visitId);
  const save = useSave<Visit>("visits");
  const del = useDelete("visits");
  const f = useFields({
    visit_date: today(),
    doctor_id: params.get("doctor") ?? "",
    condition_ids: "",
    reason: "",
    notes: "",
    follow_up_on: "",
    follow_up_note: "",
  });
  useLoadRecord(existing.data, f);
  if (visitId && existing.isPending) return <Loading />;
  const v = existing.data;
  const memberId = newFor ?? v?.member_id ?? "";
  const back = () => navigate(`/m/${memberId}/visits`, { replace: true });
  const openFollowUp = v?.follow_up_on && !v.follow_up_done ? v.follow_up_on : null;

  const markDone = async () => {
    await save.mutateAsync({ id: v!.id, data: { follow_up_done: "1" } });
    toast.success("Follow-up marked as done");
    back();
  };

  return (
    <FormPage
      title="Visit"
      heading={visitId ? "Visit" : "Log a visit"}
      onSubmit={async () => {
        if (!f.values.visit_date) throw new Error("Visit date is required");
        // A new follow-up date reopens a follow-up that was already done.
        const reopened = v && f.values.follow_up_on && f.values.follow_up_on !== (v.follow_up_on ?? "");
        await save.mutateAsync({ id: visitId, data: { ...toPayload(f.values), condition_ids: splitIds(f.values.condition_ids), member_id: memberId, ...(reopened ? { follow_up_done: "0" } : {}) } });
        toast.success("Visit saved");
        back();
      }}
      footer={
        visitId && (
          <ConfirmDelete
            what="this visit"
            detail={v?.prescription_id ? "The prescription and its medicines are kept." : "The visit and its follow-up are removed."}
            onConfirm={async () => (await del.mutateAsync(visitId), back())}
          />
        )
      }
    >
      {openFollowUp && (
        <div className="flex flex-col gap-3 rounded-sm border border-iris bg-iris-surface p-4">
          <p className="type-body">
            <span className="font-semibold">Follow-up {daysUntil(openFollowUp) < 0 ? "overdue" : "due"}:</span> {formatDate(openFollowUp)}
            {v?.doctor_name && <> with {v.doctor_name}</>}
            {v?.follow_up_note && <span className="block type-label text-ink-muted">{v.follow_up_note}</span>}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild type="button">
              <Link to={`/m/${memberId}/visits/new${v?.doctor_id ? `?doctor=${v.doctor_id}` : ""}`}>
                <CalendarCheck /> Log the visit
              </Link>
            </Button>
            <Button type="button" variant="secondary" onClick={markDone}>
              Mark as done
            </Button>
          </div>
        </div>
      )}
      {v?.prescription_id && (
        <Button asChild type="button" variant="secondary">
          <Link to={`/prescriptions/${v.prescription_id}`}>
            <FileText /> Prescription from this visit
          </Link>
        </Button>
      )}
      <Field label="Visit date" required>
        <Input type="date" {...f.bind("visit_date")} max={today()} />
      </Field>
      <DoctorPicker value={f.values.doctor_id} onChange={(id) => f.set("doctor_id", id)} />
      <ConditionsPicker memberId={memberId} value={splitIds(f.values.condition_ids)} onChange={(ids) => f.set("condition_ids", ids.join(","))} />
      <Field label="Reason" hint="e.g. Monthly check-up, eye pain, blood test review">
        <Input {...f.bind("reason")} maxLength={300} />
      </Field>
      <Field label="What the doctor said" hint="Findings, changes, tests advised">
        <Textarea {...f.bind("notes")} />
      </Field>
      <FollowUpField
        from={f.values.visit_date}
        date={f.values.follow_up_on}
        note={f.values.follow_up_note}
        onDate={(d) => f.set("follow_up_on", d)}
        onNote={(n) => f.set("follow_up_note", n)}
      />
    </FormPage>
  );
}
