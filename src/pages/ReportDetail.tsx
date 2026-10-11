import { Link, useNavigate, useParams } from "react-router";
import { Pencil } from "lucide-react";
import { REPORT_TYPES } from "@shared/types";
import { useDelete, useReport } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { FileGallery } from "@/components/FileGallery";
import { ErrorState, Loading, Page, Section, TopBar } from "@/components/layout";
import { formatDate, relativeDays } from "@/lib/format";

export function ReportDetail() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const q = useReport(reportId);
  const del = useDelete("reports");
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
  const r = q.data;
  const facts = [
    REPORT_TYPES.find((t) => t.value === r.report_type)?.label,
    r.lab_name,
    r.doctor_name && `Ordered by ${r.doctor_name}`,
    r.condition_name && `For ${r.condition_name}`,
  ].filter(Boolean);

  return (
    <>
      <TopBar
        back={`/m/${r.member_id}/reports`}
        title="Report"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="Edit report">
            <Link to={`/reports/${r.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
        }
      />
      <Page>
        <div className="mt-6 mb-8">
          <div className="meta text-ink-faint">
            {formatDate(r.report_date)} · {relativeDays(r.report_date)}
          </div>
          <h1 className="mt-2 display-lg">{r.title}</h1>
          <div className="mt-1 type-label text-ink-faint">{facts.join(" · ")}</div>
        </div>
        {r.notes && (
          <Section title="What it says">
            <p className="whitespace-pre-wrap statement-md">{r.notes}</p>
          </Section>
        )}
        <Section title={`Pages · ${r.files.length}`}>
          {r.files.length ? <FileGallery files={r.files} /> : <p className="type-label text-ink-faint">No photos attached. Edit to add them.</p>}
        </Section>
        <div className="border-t border-rule pt-6">
          <ConfirmDelete
            what="this report"
            detail="Its photos will also be deleted."
            onConfirm={async () => {
              await del.mutateAsync(r.id);
              navigate(`/m/${r.member_id}/reports`, { replace: true });
            }}
          />
        </div>
      </Page>
    </>
  );
}
