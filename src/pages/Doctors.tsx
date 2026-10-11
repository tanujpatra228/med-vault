import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Phone, Plus } from "lucide-react";
import type { Doctor } from "@shared/types";
import { useDelete, useDoctor, useDoctors, useSave } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { EmptyState, ErrorState, Loading, Page, TopBar } from "@/components/layout";
import { Row, RowList, Tile } from "@/components/Row";
import { formatDate } from "@/lib/format";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

export function DoctorsPage() {
  const q = useDoctors();
  return (
    <>
      <TopBar back="/" title="Family" />
      <Page>
        <h1 className="mt-6 mb-8 display-lg">Doctors</h1>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState title="No doctors yet" body="Doctors are added here or straight from a prescription." />
        ) : (
          <RowList>
            {q.data.map((d) => (
              <Row
                key={d.id}
                to={`/doctors/${d.id}`}
                leading={<Tile label={d.name.replace(/^dr\.?\s*/i, "")} />}
                title={d.name}
                subtitle={[d.specialty, d.member_names && `Sees ${d.member_names}`, d.last_seen && `Last ${formatDate(d.last_seen)}`].filter(Boolean).join(" · ")}
                action={
                  d.phone ? (
                    <a
                      href={`tel:${d.phone}`}
                      aria-label={`Call ${d.name}`}
                      className="flex size-12 items-center justify-center rounded-sm border border-rule"
                    >
                      <Phone className="size-5" />
                    </a>
                  ) : undefined
                }
              />
            ))}
          </RowList>
        )}
        <Button asChild variant="secondary" className="mt-4 w-full">
          <Link to="/doctors/new">
            <Plus /> Add a doctor
          </Link>
        </Button>
      </Page>
    </>
  );
}

export function DoctorForm() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const existing = useDoctor(doctorId);
  const save = useSave<Doctor>("doctors");
  const del = useDelete("doctors");
  const f = useFields({ name: "", specialty: "", clinic: "", phone: "", address: "", notes: "" });
  useLoadRecord(existing.data, f);
  if (doctorId && existing.isPending) return <Loading />;

  return (
    <FormPage
      title="Doctor"
      heading={doctorId ? "Edit doctor" : "Add a doctor"}
      onSubmit={async () => {
        if (!f.values.name.trim()) throw new Error("Name is required");
        await save.mutateAsync({ id: doctorId, data: toPayload(f.values) });
        toast.success("Doctor saved");
        navigate("/doctors", { replace: true });
      }}
      footer={
        doctorId && (
          <ConfirmDelete
            what="this doctor"
            detail="Prescriptions and medicines from this doctor are kept, without the doctor's name."
            onConfirm={async () => (await del.mutateAsync(doctorId), navigate("/doctors", { replace: true }))}
          />
        )
      }
    >
      <Field label="Name" required>
        <Input {...f.bind("name")} placeholder="Dr. Mehta" />
      </Field>
      <FieldRow>
        <Field label="Specialty">
          <Input {...f.bind("specialty")} placeholder="Eye" />
        </Field>
        <Field label="Phone">
          <Input type="tel" inputMode="tel" {...f.bind("phone")} />
        </Field>
      </FieldRow>
      <Field label="Clinic / hospital">
        <Input {...f.bind("clinic")} />
      </Field>
      <Field label="Address">
        <Textarea {...f.bind("address")} className="min-h-20" />
      </Field>
      <Field label="Notes" hint="e.g. Timings, appointment number">
        <Textarea {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
