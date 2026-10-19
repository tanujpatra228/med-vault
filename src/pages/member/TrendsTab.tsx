import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { formatValue } from "@shared/labs";
import { useLabs, useMedications, useReports } from "@/api/hooks";
import { coursesIn, medicineCourses, type MedicineCourse } from "@shared/courses";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading, Section } from "@/components/layout";
import { FlagBadge } from "@/components/LabValuesEditor";
import { LabChart, Sparkline } from "@/components/LabChart";
import { HomeReadings } from "@/components/HomeReadings";
import { formatDate } from "@/lib/format";
import { changeText, groupTrends, type Trend } from "@/lib/labs";
import { today } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rows shown before "Show all": medicines linked to this test's conditions, else the most recent. */
const DEFAULT_ROWS = 3;

function TrendDetail({ tr, courses, reportConditions }: { tr: Trend; courses: MedicineCourse[]; reportConditions: Map<string, string[]> }) {
  const [allMeds, setAllMeds] = useState(false);
  const from = tr.points[0]?.date ?? today();
  // Medicines taken between the first result and today, linked ones (same condition as this test's reports) first.
  const conditions = new Set(tr.results.flatMap((r) => reportConditions.get(r.report_id) ?? []));
  const linked = (c: MedicineCourse) => c.conditionIds.some((id) => conditions.has(id));
  const lastChange = (c: MedicineCourse) => c.segments[c.segments.length - 1].from;
  const inPeriod = coursesIn(courses, from, today()).sort((a, b) => Number(linked(b)) - Number(linked(a)) || lastChange(b).localeCompare(lastChange(a)));
  const preferred = conditions.size ? inPeriod.filter(linked) : [];
  const shown = allMeds ? inPeriod : (preferred.length ? preferred : inPeriod).slice(0, DEFAULT_ROWS);
  const hidden = inPeriod.length - shown.length;
  return (
    <div className="flex flex-col gap-4 border-t border-rule-soft pt-4 pb-2">
      {tr.points.length > 0 && (
        <div>
          <LabChart points={tr.points} low={tr.low} high={tr.high} unit={tr.unit} label={tr.label} courses={shown} />
          {(hidden > 0 || allMeds) && (
            <button type="button" onClick={() => setAllMeds((v) => !v)} aria-expanded={allMeds} className="mt-2 h-9 rounded-sm border border-rule px-3 type-caption text-ink-muted">
              {allMeds ? "Show fewer medicines" : `Show all medicines (${hidden} more)`}
            </button>
          )}
        </div>
      )}
      {(tr.low !== null || tr.high !== null) && (
        <p className="-mt-2 flex items-center gap-2 type-caption text-ink-faint">
          <span aria-hidden className="inline-block h-3 w-5 rounded-[2px] bg-(--chart-band) opacity-20" />
          Normal range {tr.latest.ref_text ?? [tr.low, tr.high].map((v) => (v === null ? "" : formatValue(v))).join("–")}
          {tr.unit && !/[a-zµ%/]/i.test(tr.latest.ref_text ?? "") ? ` ${tr.unit}` : ""}
        </p>
      )}
      <table className="w-full type-label">
        <caption className="sr-only">{tr.label} results</caption>
        <thead>
          <tr className="text-left text-ink-faint">
            <th className="py-1 font-normal">Date</th>
            <th className="py-1 font-normal">Result</th>
            <th className="py-1 font-normal">Report</th>
          </tr>
        </thead>
        <tbody>
          {[...tr.results].reverse().map((r) => (
            <tr key={r.id} className="border-t border-rule-soft">
              <td className="py-1.5 num text-[12px] whitespace-nowrap">{formatDate(r.report_date)}</td>
              <td className="py-1.5">
                <span className="font-semibold">{r.value_text}</span> {r.unit} {r.flag && <span className="text-ink-muted">· {r.flag === "high" ? "High" : "Low"}</span>}
              </td>
              <td className="py-1.5">
                <Link to={`/reports/${r.report_id}`} className="text-iris hover:underline">
                  {r.report_title}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Each test over time: out-of-range first, tap one to see its chart, readings and medicine changes. */
export function TrendsTab({ memberId }: { memberId: string }) {
  const labs = useLabs(memberId);
  const meds = useMedications(memberId);
  const reports = useReports(memberId);
  const [open, setOpen] = useState<string | null>(null);
  if (labs.isPending) return <Loading />;
  if (labs.isError) return <ErrorState error={labs.error} retry={() => labs.refetch()} />;
  const trends = groupTrends(labs.data);
  if (!trends.length)
    return (
      <div>
        <HomeReadings memberId={memberId} />
        <EmptyState
          title="No lab results yet"
          body="Scan a report: every value on it is read, and each test gets a chart here as reports add up."
          action={
            <Button asChild>
              <Link to={`/m/${memberId}/reports/new`}>Add a report</Link>
            </Button>
          }
        />
      </div>
    );
  const courses = medicineCourses(meds.data ?? [], today());
  const reportConditions = new Map((reports.data ?? []).map((r) => [r.id, (r.condition_ids ?? "").split(",").filter(Boolean)]));
  const numeric = trends.filter((tr) => tr.points.length > 0);
  const textOnly = trends.filter((tr) => tr.points.length === 0);
  const current = open ?? numeric[0]?.key ?? null;

  return (
    <div>
      <HomeReadings memberId={memberId} />
      <h2 className="mb-3 meta text-ink-faint">Lab results</h2>
      <div className="rounded-sm border border-rule bg-sheet px-4">
        {numeric.map((tr, i) => {
          const isOpen = current === tr.key;
          return (
            <div key={tr.key} className={cn(i > 0 && "border-t border-rule-soft")}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : tr.key)} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 type-body font-semibold">
                    {tr.label} <FlagBadge flag={tr.latest.flag} />
                  </span>
                  <span className="mt-0.5 block type-label text-ink-faint">
                    <span className="num text-ink">{tr.latest.value_text}</span> {tr.unit} · {formatDate(tr.latest.report_date)}
                    {changeText(tr) && <span className="block">{changeText(tr)}</span>}
                  </span>
                </span>
                <Sparkline points={tr.points} />
                <ChevronDown className={cn("size-5 shrink-0 text-ink-faint transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && <TrendDetail tr={tr} courses={courses} reportConditions={reportConditions} />}
            </div>
          );
        })}
      </div>
      {textOnly.length > 0 && (
        <Section title="Other results" className="mt-8">
          <ul className="flex flex-col gap-2">
            {textOnly.map((tr) => (
              <li key={tr.key} className="flex justify-between gap-3 type-body">
                <span>{tr.label}</span>
                <span className="text-right">
                  <span className="font-semibold">{tr.latest.value_text}</span>
                  <span className="block type-caption text-ink-faint">{formatDate(tr.latest.report_date)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="mt-6 type-caption text-ink-faint">Charts show what the reports say. Ask the doctor what a change means.</p>
    </div>
  );
}
