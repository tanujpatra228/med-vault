import { Link } from "react-router";
import { usePrescriptions } from "@/api/hooks";
import { fileUrl } from "@/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading } from "@/components/layout";
import { Row, RowList, Tile } from "@/components/Row";
import { Badge } from "@/components/ui/badge";
import { DateStack } from "./SummaryTab";
import { plural } from "@/lib/format";

export function PrescriptionsTab({ memberId }: { memberId: string }) {
  const q = usePrescriptions(memberId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length)
    return (
      <EmptyState
        title="No prescriptions yet"
        body="Take a photo of the prescription and add the medicines on it."
        action={
          <Button asChild>
            <Link to={`/m/${memberId}/prescriptions/new`}>Add a prescription</Link>
          </Button>
        }
      />
    );
  return (
    <RowList>
      {q.data.map((p, i) => (
        <Row
          key={p.id}
          to={`/prescriptions/${p.id}`}
          leading={
            p.cover_file_id ? (
              <img src={fileUrl(p.cover_file_id)} alt="" loading="lazy" className="size-11 shrink-0 rounded-md border border-rule object-cover" />
            ) : (
              <Tile label={p.doctor_name ?? "Rx"} className="size-11" />
            )
          }
          title={
            <span className="flex items-center gap-2">
              <span className="truncate">{p.doctor_name ?? "Prescription"}</span>
              {i === 0 && <Badge variant="focus">Latest</Badge>}
            </span>
          }
          subtitle={[p.doctor_specialty, p.condition_name, plural(p.med_count ?? 0, "medicine")].filter(Boolean).join(" · ")}
          trailing={<DateStack date={p.prescribed_on} />}
          chevron={false}
        />
      ))}
    </RowList>
  );
}
