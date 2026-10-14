import { Link } from "react-router";
import { useVisits } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { dueLabel } from "@/components/FollowUps";
import { formatDate } from "@/lib/format";
import { DateStack } from "./SummaryTab";

/** Every visit, newest first. Prescriptions log their visit automatically. */
export function VisitsTab({ memberId }: { memberId: string }) {
  const q = useVisits(memberId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const add = (
    <Button asChild variant="secondary" className="w-full">
      <Link to={`/m/${memberId}/visits/new`}>Log a visit</Link>
    </Button>
  );
  if (!q.data.length)
    return <EmptyState title="No visits yet" body="Saving a prescription logs its visit. Log other visits (check-ups, tests) here." action={add} />;
  return (
    <div className="flex flex-col gap-4">
      <RowList>
        {q.data.map((v) => {
          const open = v.follow_up_on && !v.follow_up_done;
          return (
            <Row
              key={v.id}
              to={`/visits/${v.id}`}
              title={v.doctor_name ?? "Visit"}
              subtitle={
                <span className="flex flex-col gap-1">
                  <span>{[v.doctor_specialty, v.reason ?? v.condition_name, v.prescription_id ? "Prescription" : null].filter(Boolean).join(" · ") || "No details"}</span>
                  {v.follow_up_on && (
                    <span>
                      {open ? <Badge variant={dueLabel(v.follow_up_on).variant}>Follow-up: {dueLabel(v.follow_up_on).text}</Badge> : <span>Follow-up {formatDate(v.follow_up_on)} · done</span>}
                    </span>
                  )}
                </span>
              }
              trailing={<DateStack date={v.visit_date} />}
              chevron={false}
            />
          );
        })}
      </RowList>
      {add}
    </div>
  );
}
