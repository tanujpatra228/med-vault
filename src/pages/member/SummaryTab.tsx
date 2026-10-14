import { Link } from "react-router";
import { ClipboardList, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Medication, MemberSummary } from "@shared/types";
import { REPORT_TYPES } from "@shared/types";
import { useSummary } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading, Section, SectionLink } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { countWord, formatDate, plural, relativeDays } from "@/lib/format";
import { MedRow } from "./MedicinesTab";
import { medView } from "@/lib/meds";
import { TodaySection } from "./TodaySection";
import { AskDoctorSection } from "./AskDoctorSection";

function Statement({ s, current }: { s: MemberSummary; current: Medication[] }) {
  const first = s.member.name.split(" ")[0];
  const meds = current.length;
  const doctors = new Set(current.map((m) => m.doctor_id).filter(Boolean)).size;
  if (meds === 0) return <p className="statement-lg">{first} is not taking any medicines right now.</p>;
  return (
    <p className="statement-lg">
      {first} is taking <span className="num text-[0.82em]">{meds}</span> {meds === 1 ? "medicine" : "medicines"}
      {doctors > 0 && (
        <>
          {" "}
          from {countWord(doctors)} {doctors === 1 ? "doctor" : "doctors"}
        </>
      )}
      .
    </p>
  );
}

function groupByDoctor(meds: Medication[]) {
  const groups = new Map<string, { title: string; meds: Medication[] }>();
  for (const m of meds) {
    const key = m.doctor_id ?? "none";
    const title = m.doctor_name ? `${m.doctor_name}${m.doctor_specialty ? ` · ${m.doctor_specialty}` : ""}` : "No doctor";
    if (!groups.has(key)) groups.set(key, { title, meds: [] });
    groups.get(key)!.meds.push(m);
  }
  return [...groups.values()];
}

export function SummaryTab({ memberId }: { memberId: string }) {
  const q = useSummary(memberId);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data;
  const base = `/m/${memberId}`;
  const current = s.medications.filter((m) => medView(m).current);

  return (
    <div>
      <div className="pt-2 pb-8">
        <Statement s={s} current={current} />
        <Button asChild variant="secondary" className="mt-5 w-full">
          <Link to={`${base}/brief`}>
            <ClipboardList /> Visit brief for the doctor
          </Link>
        </Button>
      </div>

      {/* The one rust block on the screen: allergies must never be missed. */}
      {s.allergies.length > 0 ? (
        <Link to={`${base}/health`} className="mb-8 block rounded-sm border border-rust bg-rust-surface p-4 text-rust">
          <div className="meta mb-2">Allergies</div>
          <ul className="flex flex-col gap-1">
            {s.allergies.map((a) => (
              <li key={a.id} className="type-body">
                <span className="font-semibold">{a.allergen}</span>
                {a.reaction && <span> · {a.reaction}</span>}
                {a.severity === "severe" && <span className="font-semibold"> · Severe</span>}
              </li>
            ))}
          </ul>
        </Link>
      ) : (
        <div className="mb-8 flex items-center justify-between rounded-sm border border-rule bg-sheet p-4">
          <span className="type-label text-ink-muted">No allergies recorded</span>
          <SectionLink to={`${base}/allergies/new`}>Add allergy</SectionLink>
        </div>
      )}

      <TodaySection meds={current} />

      <AskDoctorSection
        memberId={memberId}
        name={s.member.name.split(" ")[0]}
        medCount={current.length}
        doctorCount={new Set(current.map((m) => m.doctor_id).filter(Boolean)).size}
      />

      <Section title="Health conditions" action={<SectionLink to={`${base}/health`}>All</SectionLink>}>
        {s.conditions.length ? (
          <div className="flex flex-wrap gap-2">
            {s.conditions.map((c) => (
              <Link key={c.id} to={`/conditions/${c.id}`} className="max-w-full">
                {/* Condition names can be long ("Ankylosing spondylitis, ..."): let the chip wrap instead of widening the page. */}
                <Badge variant="neutral" className="h-auto min-h-8 max-w-full shrink py-1 px-3 text-left type-label whitespace-normal [overflow-wrap:anywhere]">
                  {c.name}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="type-label text-ink-faint">No active conditions recorded.</p>
        )}
      </Section>

      <Section title="Current medicines" action={<SectionLink to={`${base}/medicines`}>All</SectionLink>}>
        {current.length ? (
          <div className="flex flex-col gap-4">
            {groupByDoctor(current).map((g) => (
              <div key={g.title}>
                <div className="mb-1.5 type-label text-ink-muted">{g.title}</div>
                <RowList>
                  {g.meds.map((m) => (
                    <MedRow key={m.id} med={m} showDoctor={false} />
                  ))}
                </RowList>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No current medicines" body="Add a prescription and its medicines show up here." />
        )}
      </Section>

      <Section title="Latest prescription" action={<SectionLink to={`${base}/prescriptions`}>All</SectionLink>}>
        {s.latest_prescription ? (
          <RowList>
            <Row
              to={`/prescriptions/${s.latest_prescription.id}`}
              title={s.latest_prescription.doctor_name ?? "Prescription"}
              subtitle={[s.latest_prescription.condition_name, plural(s.latest_prescription.med_count ?? 0, "medicine")].filter(Boolean).join(" · ")}
              trailing={<DateStack date={s.latest_prescription.prescribed_on} />}
            />
          </RowList>
        ) : (
          <p className="type-label text-ink-faint">No prescriptions yet.</p>
        )}
      </Section>

      <Section title="Latest report" action={<SectionLink to={`${base}/reports`}>All</SectionLink>}>
        {s.latest_report ? (
          <RowList>
            <Row
              to={`/reports/${s.latest_report.id}`}
              title={s.latest_report.title}
              subtitle={[REPORT_TYPES.find((t) => t.value === s.latest_report!.report_type)?.label, s.latest_report.lab_name].filter(Boolean).join(" · ")}
              trailing={<DateStack date={s.latest_report.report_date} />}
            />
          </RowList>
        ) : (
          <p className="type-label text-ink-faint">No reports yet.</p>
        )}
      </Section>

      {s.doctors.length > 0 && (
        <Section title="Doctors">
          <RowList>
            {s.doctors.map((d) => (
              <Row
                key={d.id}
                title={d.name}
                subtitle={[d.specialty, `${d.med_count} ${d.med_count === 1 ? "medicine" : "medicines"}`].filter(Boolean).join(" · ")}
                trailing={
                  d.phone ? (
                    <a href={`tel:${d.phone}`} aria-label={`Call ${d.name}`} className="flex size-12 items-center justify-center rounded-sm border border-rule text-ink">
                      <Phone className="size-5" />
                    </a>
                  ) : undefined
                }
              />
            ))}
          </RowList>
        </Section>
      )}
    </div>
  );
}

export function DateStack({ date }: { date: string | null }) {
  if (!date) return null;
  return (
    <span className="block">
      <span className="block num text-[13px] font-medium">{formatDate(date)}</span>
      <span className="block type-caption text-ink-faint">{relativeDays(date)}</span>
    </span>
  );
}
