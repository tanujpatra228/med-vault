import { useParams } from "react-router";
import { toast } from "sonner";
import { Printer, Share2 } from "lucide-react";
import type { Medication, MemberSummary, Report } from "@shared/types";
import { reportTypeLabel } from "@shared/reports";
import { describe as describeSchedule } from "@shared/schedule";
import { useLabs, useMedications, useReadings, useReports, useReview, useSummary } from "@/api/hooks";
import { summarize, type ReadingSummary } from "@shared/readings";
import { changeText, groupTrends, type Trend } from "@/lib/labs";
import type { ReviewItem } from "@shared/review";
import { REVIEW_DISCLAIMER, ReviewItemCard } from "@/pages/member/AskDoctorSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState, Loading, Page, TopBar } from "@/components/layout";
import { Wordmark } from "@/components/Mark";
import { addDays, age, capitalize, formatDate, today } from "@/lib/format";
import { medView } from "@/lib/meds";

const RECENT_DAYS = 90;

/** One doctor's medicines, for grouping. */
interface DoctorGroup {
  title: string;
  meds: Medication[];
}

function groupByDoctor(meds: Medication[]): DoctorGroup[] {
  const groups = new Map<string, DoctorGroup>();
  for (const m of meds) {
    const key = m.doctor_id ?? "none";
    const title = m.doctor_name ? `${m.doctor_name}${m.doctor_specialty ? ` (${m.doctor_specialty})` : ""}` : "Not linked to a doctor";
    if (!groups.has(key)) groups.set(key, { title, meds: [] });
    groups.get(key)!.meds.push(m);
  }
  return [...groups.values()];
}

/** Plain-language dose lines, e.g. ["Saturday: 2 after breakfast.", ...]; falls back to the dosage text. */
function doseLines(m: Medication): string[] {
  const v = medView(m);
  if (!v.schedule) return m.dosage ? [m.dosage] : [];
  return describeSchedule(v.schedule, m.start_date, { timing: m.timing, form: m.form }).flatMap((p) =>
    p.heading ? [`${p.heading}: ${p.lines.join(" ")}`] : p.lines,
  );
}

const reportLabel = (r: Report) => reportTypeLabel(r.report_type);

/** WhatsApp-friendly plain text version of the brief. */
const READINGS_DAYS = 30;

/** "avg 139/87, highest 152/94, 12 readings, 3 high". */
const readingLine = (r: ReadingSummary) =>
  `avg ${r.average}, highest ${r.highest}, lowest ${r.lowest}, ${r.count} ${r.count === 1 ? "reading" : "readings"}${r.high ? `, ${r.high} high` : ""}${r.low ? `, ${r.low} low` : ""}`;

function briefText(s: MemberSummary, current: Medication[], recent: Medication[], reports: Report[], questions: ReviewItem[], trends: Trend[], home: ReadingSummary[]): string {
  const m = s.member;
  const years = age(m.dob);
  const lines: string[] = [
    `Medical summary: ${m.name}`,
    [years !== null ? `${years} yrs` : null, m.sex ? capitalize(m.sex) : null, m.blood_group ? `Blood ${m.blood_group}` : null].filter(Boolean).join(", "),
    `As of ${formatDate(today())}`,
    "",
    `ALLERGIES: ${s.allergies.length ? s.allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ""}${a.severity === "severe" ? " SEVERE" : ""}`).join("; ") : "None recorded"}`,
    `CONDITIONS: ${s.conditions.length ? s.conditions.map((c) => c.name).join(", ") : "None recorded"}`,
    "",
    "CURRENT MEDICINES:",
  ];
  for (const g of groupByDoctor(current)) {
    lines.push(`From ${g.title}:`);
    for (const med of g.meds) {
      const v = medView(med);
      lines.push(`- ${med.name}${med.strength ? ` ${med.strength}` : ""}${v.weekly ? " [WEEKLY]" : ""}${v.taper ? " [CHANGING DOSE]" : ""}`);
      for (const l of doseLines(med)) lines.push(`  ${l}`);
    }
  }
  if (!current.length) lines.push("None");
  if (recent.length) {
    lines.push("", `STOPPED IN LAST ${RECENT_DAYS} DAYS:`);
    for (const med of recent) lines.push(`- ${med.name}${med.strength ? ` ${med.strength}` : ""}${med.end_date ? `, until ${formatDate(med.end_date)}` : ""}`);
  }
  if (reports.length) {
    lines.push("", "RECENT REPORTS:");
    for (const r of reports) lines.push(`- ${formatDate(r.report_date)}: ${r.title}${r.notes ? `. ${r.notes}` : ""}`);
  }
  if (trends.length) {
    lines.push("", "LAB RESULTS (latest):");
    for (const tr of trends) lines.push(`- ${tr.label}: ${tr.latest.value_text}${tr.unit ? ` ${tr.unit}` : ""}${tr.latest.flag ? ` (${tr.latest.flag.toUpperCase()})` : ""}, ${formatDate(tr.latest.report_date)}${changeText(tr) ? `. ${changeText(tr)}` : ""}`);
  }
  if (home.length) {
    lines.push("", `HOME READINGS (last ${READINGS_DAYS} days):`);
    for (const r of home) lines.push(`- ${r.label}: ${readingLine(r)}`);
  }
  if (questions.length) {
    lines.push("", "QUESTIONS FOR THE DOCTOR:");
    for (const q of questions) lines.push(`- ${q.question} (${q.medicines.join(", ")})`);
  }
  if (m.notes) lines.push("", `NOTES: ${m.notes}`);
  return lines.join("\n");
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule py-4 break-inside-avoid">
      <h2 className="meta mb-2 text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Everything a doctor needs at a glance: allergies, conditions, every current medicine from
 * every doctor, recent changes and reports. Prints cleanly and shares as text.
 */
export function VisitBrief() {
  const { memberId = "" } = useParams();
  const summary = useSummary(memberId);
  const meds = useMedications(memberId);
  const reports = useReports(memberId);
  const review = useReview(memberId);
  const labs = useLabs(memberId);
  const readings = useReadings(memberId, addDays(today(), -READINGS_DAYS));

  if (summary.isPending || meds.isPending || reports.isPending)
    return (
      <>
        <TopBar title="Visit brief" />
        <Loading />
      </>
    );
  if (summary.isError || meds.isError || reports.isError)
    return (
      <>
        <TopBar title="Visit brief" />
        <Page className="pt-6">
          <ErrorState error={summary.error ?? meds.error ?? reports.error} />
        </Page>
      </>
    );

  const s = summary.data;
  const m = s.member;
  const date = today();
  const since = addDays(date, -RECENT_DAYS);
  const current = meds.data.filter((x) => medView(x, date).current);
  const recent = meds.data.filter((x) => !medView(x, date).current && x.end_date && x.end_date >= since);
  const latestReports = reports.data.slice(0, 5);
  const years = age(m.dob);
  // Only a review that still matches the current medicines; a stale one could ask about stopped ones.
  const questions = review.data?.review && !review.data.stale ? review.data.review.items : [];
  // Tests from the last year, out of range first; at most 8 so the brief stays one page.
  const yearAgo = addDays(date, -365);
  const trends = groupTrends(labs.data ?? []).filter((tr) => (tr.latest.report_date ?? "") >= yearAgo).slice(0, 8);
  const home = summarize(readings.data ?? []);
  const facts = [years !== null ? `${years} yrs` : null, m.sex ? capitalize(m.sex) : null, m.blood_group ? `Blood ${m.blood_group}` : null].filter(Boolean);

  const share = async () => {
    const text = briefText(s, current, recent, latestReports, questions, trends, home);
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: `Medical summary: ${m.name}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Copied. Paste it into WhatsApp or a message.");
      }
    } catch {
      // share sheet dismissed
    }
  };

  return (
    <>
      <div data-print-hide>
        <TopBar back={`/m/${m.id}`} title="Visit brief" />
      </div>
      <Page className="pb-12">
        <div data-print-hide className="mt-4 mb-2 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer /> Print / PDF
          </Button>
          <Button variant="secondary" onClick={share}>
            <Share2 /> Share as text
          </Button>
        </div>

        <article className="mt-4">
          <div className="mb-4 hidden print:block">
            <Wordmark />
          </div>
          <div className="meta text-ink-faint">Medical summary · as of {formatDate(date)}</div>
          <h1 className="mt-1 display-lg">{m.name}</h1>
          {facts.length > 0 && <p className="mt-1 text-ink-muted">{facts.join(" · ")}</p>}

          <section className="mt-4 mb-4 rounded-sm border border-rust bg-rust-surface p-3 text-rust break-inside-avoid">
            <h2 className="meta mb-1">Allergies</h2>
            {s.allergies.length ? (
              <ul>
                {s.allergies.map((a) => (
                  <li key={a.id}>
                    <span className="font-semibold">{a.allergen}</span>
                    {a.reaction && <span> · {a.reaction}</span>}
                    {a.severity === "severe" && <span className="font-semibold"> · Severe</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None recorded</p>
            )}
          </section>

          <Block title="Health conditions">
            <p>{s.conditions.length ? s.conditions.map((c) => c.name).join(", ") : "None recorded"}</p>
          </Block>

          <Block title={`Current medicines · ${current.length}`}>
            {current.length ? (
              <div className="flex flex-col gap-4">
                {groupByDoctor(current).map((g) => (
                  <div key={g.title} className="break-inside-avoid">
                    <div className="mb-1 type-label text-ink-muted">From {g.title}</div>
                    <ul className="flex flex-col gap-2">
                      {g.meds.map((med) => {
                        const v = medView(med, date);
                        return (
                          <li key={med.id} className="rounded-sm border border-rule bg-sheet p-3 break-inside-avoid">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">
                                {med.name}
                                {med.strength && <span className="font-normal text-ink-muted"> {med.strength}</span>}
                              </span>
                              {v.weekly && <Badge variant="warn">Weekly</Badge>}
                              {v.taper && <Badge>Changing dose</Badge>}
                            </div>
                            {doseLines(med).map((l) => (
                              <p key={l} className="type-label text-ink">
                                {l}
                              </p>
                            ))}
                            {med.start_date && <p className="type-caption text-ink-faint">Since {formatDate(med.start_date)}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p>None</p>
            )}
          </Block>

          {recent.length > 0 && (
            <Block title={`Stopped in the last ${RECENT_DAYS} days`}>
              <ul className="flex flex-col gap-1">
                {recent.map((med) => (
                  <li key={med.id}>
                    {med.name}
                    {med.strength && ` ${med.strength}`}
                    <span className="text-ink-faint">{med.end_date ? ` · until ${formatDate(med.end_date)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Recent reports">
            {latestReports.length ? (
              <ul className="flex flex-col gap-2">
                {latestReports.map((r) => (
                  <li key={r.id} className="break-inside-avoid">
                    <span className="num text-[13px] text-ink-faint">{formatDate(r.report_date)}</span> <span className="font-semibold">{r.title}</span>
                    <span className="text-ink-faint"> · {reportLabel(r)}</span>
                    {r.notes && <p className="type-label text-ink-muted">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None recorded</p>
            )}
          </Block>

          {trends.length > 0 && (
            <Block title="Lab results · latest">
              <table className="w-full type-label">
                <tbody>
                  {trends.map((tr) => (
                    <tr key={tr.key} className="border-t border-rule-soft align-top first:border-t-0">
                      <td className="py-1.5 pr-2">{tr.label}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className="font-semibold">{tr.latest.value_text}</span> {tr.unit}
                        {tr.latest.flag && <span className="font-semibold text-rust"> · {tr.latest.flag === "high" ? "High" : "Low"}</span>}
                      </td>
                      <td className="py-1.5 text-ink-muted">
                        <span className="num text-[12px]">{formatDate(tr.latest.report_date)}</span>
                        {changeText(tr) && <span className="block">{changeText(tr)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          )}

          {home.length > 0 && (
            <Block title={`Home readings · last ${READINGS_DAYS} days`}>
              <table className="w-full type-label">
                <tbody>
                  {home.map((r) => (
                    <tr key={r.key} className="border-t border-rule-soft align-top first:border-t-0">
                      <td className="py-1.5 pr-2">{r.label}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className="font-semibold">avg {r.average}</span>
                        {r.high > 0 && <span className="font-semibold text-rust"> · {r.high} high</span>}
                        {r.low > 0 && <span className="font-semibold text-rust"> · {r.low} low</span>}
                      </td>
                      <td className="py-1.5 text-ink-muted">
                        {r.lowest} to {r.highest}
                        <span className="block num text-[12px]">{r.count === 1 ? "1 reading" : `${r.count} readings`}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          )}

          {questions.length > 0 && (
            <Block title="Questions for the doctor">
              <ul className="flex flex-col gap-2">
                {questions.map((q, i) => (
                  <ReviewItemCard key={i} item={q} compact />
                ))}
              </ul>
              <p className="mt-2 type-caption text-ink-faint">{REVIEW_DISCLAIMER}</p>
            </Block>
          )}

          {s.doctors.length > 0 && (
            <Block title="Treating doctors">
              <ul className="flex flex-col gap-1">
                {s.doctors.map((d) => (
                  <li key={d.id}>
                    {d.name}
                    {d.specialty && <span className="text-ink-muted"> · {d.specialty}</span>}
                    {d.phone && <span className="num text-[13px] text-ink-faint"> · {d.phone}</span>}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {m.notes && (
            <Block title="Notes">
              <p className="whitespace-pre-wrap">{m.notes}</p>
            </Block>
          )}

          <p className="mt-2 border-t border-rule pt-3 type-caption text-ink-faint">Prepared by the family with Med Vault. Please check against the original prescriptions.</p>
        </article>
      </Page>
    </>
  );
}
