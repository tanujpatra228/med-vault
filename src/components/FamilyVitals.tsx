import { useState } from "react";
import { Link } from "react-router";
import { BP_LIMITS, readingFlag, readingText, SUGAR_CONTEXTS, SUGAR_LIMITS, type Reading, type SugarContext } from "@shared/readings";
import { useMembers, useReadings } from "@/api/hooks";
import { FamilyChart, Marker, type FamilySeries, type MarkerShape } from "@/components/FamilyChart";
import { FlagBadge } from "@/components/LabValuesEditor";
import { Section } from "@/components/layout";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Color and shape follow the person (family order), never their rank in a chart. */
const SLOTS: Array<{ color: string; shape: MarkerShape }> = [
  { color: "var(--member-1)", shape: "circle" },
  { color: "var(--member-2)", shape: "square" },
  { color: "var(--member-3)", shape: "triangle" },
  { color: "var(--member-4)", shape: "diamond" },
];
/** Beyond four people the palette would no longer separate them: extra people get a neutral line and their name label. */
const EXTRA = { color: "var(--ink-faint)", shape: "circle" as MarkerShape };

type View = "bp" | SugarContext;
const PERIODS = [30, 90] as const;

const chip = (on: boolean) => cn("h-9 shrink-0 rounded-sm border px-3 type-label whitespace-nowrap", on ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted");

/** Home → Blood pressure and sugar for the whole family, one chart per measure. */
export function FamilyVitals() {
  const members = useMembers();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const q = useReadings("", since);
  const [view, setView] = useState<View | null>(null);
  const [bpPart, setBpPart] = useState<"upper" | "lower">("upper");
  const readings = q.data ?? [];
  if (!readings.length || !members.data) return null;

  const people = members.data;
  const slot = (id: string) => SLOTS[people.findIndex((p) => p.id === id)] ?? EXTRA;
  const views: Array<{ key: View; label: string }> = [
    ...(readings.some((r) => r.kind === "bp") ? [{ key: "bp" as View, label: "Blood pressure" }] : []),
    ...SUGAR_CONTEXTS.filter((c) => readings.some((r) => r.kind === "sugar" && (r.context ?? "random") === c.value)).map((c) => ({
      key: c.value as View,
      label: `Sugar · ${c.label.toLowerCase()}`,
    })),
  ];
  const current = view && views.some((v) => v.key === view) ? view : views[0].key;
  const inView = (r: Reading) => (current === "bp" ? r.kind === "bp" : r.kind === "sugar" && (r.context ?? "random") === current);
  const valueOf = (r: Reading) => (current === "bp" ? (bpPart === "upper" ? r.systolic! : r.diastolic!) : r.sugar!);
  const textOf = (r: Reading) => `${readingText(r)}${readingFlag(r) ? ` · ${readingFlag(r) === "high" ? "High" : "Low"}` : ""}`;

  const series: FamilySeries[] = people
    .map((p) => {
      const pts = readings
        .filter((r) => r.member_id === p.id && inView(r))
        .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
        .map((r) => ({ date: r.taken_at, value: valueOf(r), text: textOf(r) }));
      return { id: p.id, name: p.name, ...slot(p.id), points: pts };
    })
    .filter((s) => s.points.length > 0);
  const limit =
    current === "bp"
      ? [{ value: bpPart === "upper" ? BP_LIMITS.systolicHigh : BP_LIMITS.diastolicHigh, label: "" }]
      : [{ value: SUGAR_LIMITS[current].high, label: "" }];
  const latest = people
    .map((p) => ({ p, r: readings.filter((r) => r.member_id === p.id && inView(r)).sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0] }))
    .filter((x): x is { p: (typeof people)[number]; r: Reading } => !!x.r);

  return (
    <Section title="Blood pressure & sugar" className="mt-8">
      <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Measure">
        {views.map((v) => (
          <button key={v.key} type="button" aria-pressed={current === v.key} onClick={() => setView(v.key)} className={chip(current === v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {current === "bp" ? (
          <div className="flex gap-2" role="group" aria-label="Which number">
            <button type="button" aria-pressed={bpPart === "upper"} onClick={() => setBpPart("upper")} className={chip(bpPart === "upper")}>
              Upper
            </button>
            <button type="button" aria-pressed={bpPart === "lower"} onClick={() => setBpPart("lower")} className={chip(bpPart === "lower")}>
              Lower
            </button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-2" role="group" aria-label="Period">
          {PERIODS.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-rule bg-sheet px-3 pt-3 pb-2">
        {series.length ? (
          <FamilyChart series={series} limits={limit} unit={current === "bp" ? "mmHg" : "mg/dL"} label={views.find((v) => v.key === current)!.label} />
        ) : (
          <p className="py-8 text-center type-label text-ink-faint">No readings in the last {days} days.</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-ink-muted" aria-label="Legend">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <svg width={10} height={10} aria-hidden>
                <Marker shape={s.shape} x={5} y={5} color={s.color} ring={false} />
              </svg>
              {s.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-ink-faint">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-(--chart-band)" />
            {current === "bp" ? `High from ${bpPart === "upper" ? BP_LIMITS.systolicHigh : BP_LIMITS.diastolicHigh}` : `High from ${SUGAR_LIMITS[current].high}`}
          </span>
        </div>
      </div>

      {latest.length > 0 && (
        <table className="mt-3 w-full type-label">
          <caption className="sr-only">Latest reading per person</caption>
          <tbody>
            {latest.map(({ p, r }) => (
              <tr key={p.id} className="border-t border-rule-soft first:border-t-0">
                <td className="py-2">
                  <Link to={`/m/${p.id}/trends`} className="flex items-center gap-2 text-ink hover:underline">
                    <svg width={10} height={10} aria-hidden className="shrink-0">
                      <Marker shape={slot(p.id).shape} x={5} y={5} color={slot(p.id).color} ring={false} />
                    </svg>
                    {p.name}
                  </Link>
                </td>
                <td className="py-2 text-right">
                  <span className="font-semibold">{readingText(r)}</span> <FlagBadge flag={readingFlag(r)} />
                  <span className="block type-caption text-ink-faint">
                    {formatDate(r.taken_at)}, {r.taken_at.slice(11, 16)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 type-caption text-ink-faint">Limits are general adult guidelines. A doctor may set a different target.</p>
    </Section>
  );
}
