import { useState } from "react";
import type { Medication } from "@shared/types";
import { useMedications } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading, Section, SectionLink } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { formatDate } from "@/lib/format";
import { medView, todayLine } from "@/lib/meds";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function MedRow({ med, showDoctor = true }: { med: Medication; showDoctor?: boolean }) {
  const v = medView(med);
  const muted = !v.current;
  const status =
    med.status === "stopped" ? (med.end_date ? `Stopped ${formatDate(med.end_date)}` : "Stopped") : v.finished && !v.today ? `Course finished ${formatDate(med.end_date)}` : todayLine(v);
  const meta = [showDoctor ? med.doctor_name : null, v.current && med.start_date ? `since ${formatDate(med.start_date)}` : null].filter(Boolean).join(" · ");
  return (
    <Row
      to={`/medications/${med.id}`}
      muted={muted}
      title={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate">
            {med.name}
            {med.strength && <span className="font-normal text-ink-muted"> {med.strength}</span>}
          </span>
          {v.current && v.weekly && <Badge variant="warn">Weekly</Badge>}
          {v.current && v.taper && <Badge>Changing dose</Badge>}
        </span>
      }
      subtitle={
        <span className="flex flex-col gap-0.5">
          {v.doseLine && <span className={cn("num text-[13px] font-medium", muted ? "text-ink-faint" : "text-ink")}>{v.doseLine}</span>}
          {status && <span className={cn(v.today?.kind === "due" && !muted ? "text-ink-muted" : "text-ink-faint")}>{status}</span>}
          {meta && <span>{meta}</span>}
        </span>
      }
    />
  );
}

export function MedicinesTab({ memberId }: { memberId: string }) {
  const q = useMedications(memberId);
  const [showStopped, setShowStopped] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const active = q.data.filter((m) => medView(m).current);
  const stopped = q.data.filter((m) => !medView(m).current);

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
        <Section title={`Stopped or finished · ${stopped.length}`}>
          {showStopped ? (
            <RowList>
              {stopped.map((m) => (
                <MedRow key={m.id} med={m} />
              ))}
            </RowList>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setShowStopped(true)}>
              Show {stopped.length} past {stopped.length === 1 ? "medicine" : "medicines"}
            </Button>
          )}
        </Section>
      )}
    </div>
  );
}
