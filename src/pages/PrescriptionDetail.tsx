import { Link, useNavigate, useParams } from "react-router";
import { Pencil, Plus } from "lucide-react";
import { useDelete, usePrescription } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { FileGallery } from "@/components/FileGallery";
import { EmptyState, ErrorState, Loading, Page, Section, TopBar } from "@/components/layout";
import { RowList } from "@/components/Row";
import { formatDate, relativeDays } from "@/lib/format";
import { MedRow } from "./member/MedicinesTab";

export function PrescriptionDetail() {
  const { prescriptionId } = useParams();
  const navigate = useNavigate();
  const q = usePrescription(prescriptionId);
  const del = useDelete("prescriptions");
  if (q.isPending)
    return (
      <>
        <TopBar />
        <Loading />
      </>
    );
  if (q.isError)
    return (
      <>
        <TopBar />
        <Page className="pt-6">
          <ErrorState error={q.error} retry={() => q.refetch()} />
        </Page>
      </>
    );
  const p = q.data;
  const addMed = `/m/${p.member_id}/medications/new?${new URLSearchParams({ prescription_id: p.id, doctor_id: p.doctor_id ?? "", condition_id: p.condition_id ?? "" })}`;

  return (
    <>
      <TopBar
        back={`/m/${p.member_id}/prescriptions`}
        title="Prescription"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="Edit prescription">
            <Link to={`/prescriptions/${p.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
        }
      />
      <Page>
        <div className="mt-6 mb-8">
          <div className="meta text-ink-faint">
            {formatDate(p.prescribed_on)} · {relativeDays(p.prescribed_on)}
          </div>
          <h1 className="mt-2 display-lg">{p.doctor_name ?? "Prescription"}</h1>
          <div className="mt-1 type-label text-ink-faint">{[p.doctor_specialty, p.condition_name && `For ${p.condition_name}`].filter(Boolean).join(" · ")}</div>
        </div>

        {p.files.length > 0 && (
          <Section title={`Photos · ${p.files.length}`}>
            <FileGallery files={p.files} />
          </Section>
        )}

        <Section title={`Medicines · ${p.medications.length}`}>
          {p.medications.length ? (
            <RowList>
              {p.medications.map((m) => (
                <MedRow key={m.id} med={m} showDoctor={false} />
              ))}
            </RowList>
          ) : (
            <EmptyState title="No medicines added" body="Add the medicines written on this prescription." />
          )}
          <Button asChild variant="secondary" className="mt-3 w-full">
            <Link to={addMed}>
              <Plus /> Add a medicine to this prescription
            </Link>
          </Button>
        </Section>

        {p.notes && (
          <Section title="Doctor's advice">
            <p className="whitespace-pre-wrap">{p.notes}</p>
          </Section>
        )}

        <div className="border-t border-rule pt-6">
          <ConfirmDelete
            what="this prescription"
            detail="Its photos and the medicines that came from it will also be deleted."
            onConfirm={async () => {
              await del.mutateAsync(p.id);
              navigate(`/m/${p.member_id}/prescriptions`, { replace: true });
            }}
          />
        </div>
      </Page>
    </>
  );
}
