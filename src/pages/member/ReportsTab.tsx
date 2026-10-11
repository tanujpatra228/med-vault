import { useState } from "react";
import { Link } from "react-router";
import { REPORT_TYPES } from "@shared/types";
import { useReports } from "@/api/hooks";
import { fileUrl } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading } from "@/components/layout";
import { Row, RowList, Tile } from "@/components/Row";
import { cn } from "@/lib/utils";
import { DateStack } from "./SummaryTab";

export function ReportsTab({ memberId }: { memberId: string }) {
  const [type, setType] = useState<string | undefined>();
  const q = useReports(memberId, type);

  return (
    <div>
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by type">
        {[{ value: undefined, label: "All" }, ...REPORT_TYPES].map((t) => (
          <button
            key={t.label}
            type="button"
            aria-pressed={type === t.value}
            onClick={() => setType(t.value)}
            className={cn(
              "h-10 shrink-0 rounded-sm border px-3 type-label whitespace-nowrap",
              type === t.value ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title={type ? "No reports of this type" : "No reports yet"}
          body="Photograph lab reports, X-rays and scans so the latest is always at hand."
          action={
            <Button asChild>
              <Link to={`/m/${memberId}/reports/new`}>Add a report</Link>
            </Button>
          }
        />
      ) : (
        <RowList>
          {q.data.map((r, i) => (
            <Row
              key={r.id}
              to={`/reports/${r.id}`}
              leading={
                r.cover_file_id ? (
                  <img src={fileUrl(r.cover_file_id)} alt="" loading="lazy" className="size-11 shrink-0 rounded-md border border-rule object-cover" />
                ) : (
                  <Tile label={r.title} className="size-11" />
                )
              }
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{r.title}</span>
                  {i === 0 && <Badge variant="focus">Latest</Badge>}
                </span>
              }
              subtitle={[REPORT_TYPES.find((t) => t.value === r.report_type)?.label, r.lab_name].filter(Boolean).join(" · ")}
              trailing={<DateStack date={r.report_date} />}
              chevron={false}
            />
          ))}
        </RowList>
      )}
    </div>
  );
}
