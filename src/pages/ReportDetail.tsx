import { Link, useNavigate, useParams } from "react-router";
import { Pencil } from "lucide-react";
import { reportTypeLabel } from "@shared/reports";
import { useDelete, useReport } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { FileGallery } from "@/components/FileGallery";
import { ErrorState, Loading, Page, Section, SectionLink, TopBar } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
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
    reportTypeLabel(r.report_type),
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
        {r.values.length > 0 && (
          <Section title={`Results · ${r.values.length}`} action={<SectionLink to={`/m/${r.member_id}/trends`}>Trends</SectionLink>}>
            <table className="w-full type-label">
              <thead>
                <tr className="text-left text-ink-faint">
                  <th className="py-1 font-normal">Test</th>
                  <th className="py-1 font-normal">Result</th>
                  <th className="py-1 font-normal">Normal</th>
                </tr>
              </thead>
              <tbody>
                {r.values.map((v) => (
                  <tr key={v.id} className="border-t border-rule-soft align-top">
                    <td className="py-2 pr-2">{v.test_name}</td>
                    <td className="py-2 pr-2">
                      <span className="font-semibold">{v.value_text}</span> {v.unit}
                      {v.flag && (
                        <span className="ml-1.5 inline-block">
                          <Badge variant="warn">{v.flag === "high" ? "High" : "Low"}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-ink-faint">{v.ref_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
