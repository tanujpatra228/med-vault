import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, FileText, FlaskConical, Pencil, Pill } from "lucide-react";
import type { TimelineItem } from "@shared/types";
import { queries } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading, Page, Section, TopBar } from "@/components/layout";
import { RowList } from "@/components/Row";
import { dueLabel } from "@/components/FollowUps";
import { formatDate, plural } from "@/lib/format";
import { medView } from "@/lib/meds";
import { MedRow } from "./member/MedicinesTab";

const ICON: Record<TimelineItem["type"], typeof Pill> = { prescription: FileText, medication: Pill, report: FlaskConical, visit: CalendarCheck };
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

/** Items grouped under "October 2026" headings, newest first. */
function byMonth(items: TimelineItem[]) {
  const groups: Array<{ label: string; items: TimelineItem[] }> = [];
  for (const it of items) {
    const label = it.date ? monthFmt.format(new Date(`${it.date}T00:00:00`)) : "Undated";
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

/**
 * A condition's care thread: its current medicines, the doctors involved, and every prescription,
 * report, visit and medicine linked to it, from every doctor, in one timeline.
 */
export function ConditionDetail() {
  const { conditionId = "" } = useParams();
  const q = useQuery(queries.conditionTimeline(conditionId));
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
  const { condition: k, medications, items, doctors } = q.data;
  const current = medications.filter((m) => medView(m).current);
  const lastVisit = items.find((i) => i.type === "visit" || i.type === "prescription");
  const facts = [
    k.diagnosed_on && `Since ${formatDate(k.diagnosed_on)}`,
    doctors.length > 0 && plural(doctors.length, "doctor"),
    lastVisit?.date && `Last seen ${formatDate(lastVisit.date)}`,
  ].filter(Boolean);

  return (
    <>
      <TopBar
        back={`/m/${k.member_id}/health`}
        title="Health condition"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="Edit condition">
            <Link to={`/conditions/${k.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
        }
      />
      <Page className="pb-12">
        <div className="mt-6 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="display-lg">{k.name}</h1>
            <Badge variant={k.status === "active" ? "focus" : "neutral"}>{k.status === "active" ? "Active" : "Resolved"}</Badge>
          </div>
          {facts.length > 0 && <p className="mt-2 type-label text-ink-faint">{facts.join(" · ")}</p>}
          {k.notes && <p className="mt-3 whitespace-pre-wrap text-ink-muted">{k.notes}</p>}
        </div>

        <Section title={`Current medicines · ${current.length}`} className="border-t-0 pt-0">
          {current.length ? (
            <RowList>
              {current.map((m) => (
                <MedRow key={m.id} med={m} />
              ))}
            </RowList>
          ) : (
            <p className="type-label text-ink-faint">No current medicines linked to this condition.</p>
          )}
        </Section>

        {doctors.length > 0 && (
          <Section title="Doctors">
            <div className="flex flex-wrap gap-2">
              {doctors.map((d) => (
                <Link key={d.id} to={`/doctors/${d.id}`}>
                  <Badge variant="neutral" className="h-auto py-1">
                    {d.name}
                    {d.specialty ? ` · ${d.specialty}` : ""}
                  </Badge>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <Section title={`Timeline · ${items.length}`}>
          {items.length ? (
            <div className="flex flex-col gap-5">
              {byMonth(items).map((g) => (
                <div key={g.label}>
                  <div className="mb-2 type-label text-ink-muted">{g.label}</div>
                  <ol className="relative ml-4 border-l border-rule pl-5">
                    {g.items.map((it) => {
                      const Icon = ICON[it.type];
                      return (
                        <li key={`${it.type}-${it.id}`} className="relative pb-4 last:pb-0">
                          <span className="absolute top-1 -left-[34px] flex size-7 items-center justify-center rounded-full border border-rule bg-sheet text-ink-muted">
                            <Icon className="size-3.5" />
                          </span>
                          <Link to={it.href} className="block rounded-sm hover:bg-rule-soft/50">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                              <span className="type-body font-semibold">{it.title}</span>
                              {it.date && <span className="num text-[12px] text-ink-faint">{formatDate(it.date)}</span>}
                            </span>
                            {it.subtitle && <span className="block type-label text-ink-faint">{it.subtitle}</span>}
                            {(it.flags || it.follow_up_on) && (
                              <span className="mt-1 flex flex-wrap gap-2">
                                {!!it.flags && <Badge variant="warn">{plural(it.flags, "result")} out of range</Badge>}
                                {it.follow_up_on && <Badge variant={dueLabel(it.follow_up_on).variant}>Follow-up: {dueLabel(it.follow_up_on).text}</Badge>}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing linked yet" body="Prescriptions, medicines, reports and visits show up here when you pick this condition on them." />
          )}
        </Section>
      </Page>
    </>
  );
}
