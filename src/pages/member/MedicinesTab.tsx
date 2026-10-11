import { useState } from "react";
import type { Medication } from "@shared/types";
import { useMedications } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading, Section, SectionLink } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { formatDate } from "@/lib/format";
import { Link } from "react-router";

export function MedRow({ med, showDoctor = true }: { med: Medication; showDoctor?: boolean }) {
  const stopped = med.status === "stopped";
  const sub = [
    med.timing,
    showDoctor ? med.doctor_name : null,
    stopped ? (med.end_date ? `stopped ${formatDate(med.end_date)}` : "stopped") : med.start_date ? `since ${formatDate(med.start_date)}` : null,
  ].filter(Boolean);
  return (
    <Row
      to={`/medications/${med.id}`}
      muted={stopped}
      title={
        <>
          {med.name}
          {med.strength && <span className="font-normal text-ink-muted"> {med.strength}</span>}
        </>
      }
      subtitle={sub.join(" · ") || undefined}
      trailing={med.dosage ? <span className={`num text-[15px] font-medium ${stopped ? "text-ink-faint" : ""}`}>{med.dosage}</span> : undefined}
    />
  );
}

export function MedicinesTab({ memberId }: { memberId: string }) {
  const q = useMedications(memberId);
  const [showStopped, setShowStopped] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const active = q.data.filter((m) => m.status === "active");
  const stopped = q.data.filter((m) => m.status === "stopped");

  return (
    <div>
      <Section title={`Taking now · ${active.length}`} action={<SectionLink to={`/m/${memberId}/medications/new`}>Add medicine</SectionLink>} className="border-t-0 pt-0">
        {active.length ? (
          <RowList>
            {active.map((m) => (
              <MedRow key={m.id} med={m} />
            ))}
          </RowList>
        ) : (
          <EmptyState
            title="No current medicines"
            body="The fastest way to add them is from a prescription."
            action={
              <Button asChild>
                <Link to={`/m/${memberId}/prescriptions/new`}>Add a prescription</Link>
              </Button>
            }
          />
        )}
      </Section>
      {stopped.length > 0 && (
        <Section title={`Stopped · ${stopped.length}`}>
          {showStopped ? (
            <RowList>
              {stopped.map((m) => (
                <MedRow key={m.id} med={m} />
              ))}
            </RowList>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setShowStopped(true)}>
              Show {stopped.length} stopped {stopped.length === 1 ? "medicine" : "medicines"}
            </Button>
          )}
        </Section>
      )}
    </div>
  );
}
