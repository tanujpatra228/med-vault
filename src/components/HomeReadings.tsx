import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Droplet, HeartPulse } from "lucide-react";
import { BP_LIMITS, readingFlag, readingText, SUGAR_CONTEXTS, SUGAR_LIMITS, type Reading, type SugarContext } from "@shared/readings";
import { useReadings } from "@/api/hooks";
import { usePendingReadings } from "@/lib/offline/useOnline";
import { Button } from "@/components/ui/button";
import { FlagBadge } from "@/components/LabValuesEditor";
import { LabChart, Sparkline, type ChartPoint } from "@/components/LabChart";
import { formatDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All" },
] as const;

interface Series {
  key: "bp" | SugarContext;
  label: string;
  readings: Reading[]; // oldest first
}

const when = (r: Reading) => `${formatDate(r.taken_at)}, ${r.taken_at.slice(11, 16)}`;
const point = (r: Reading, value: number): ChartPoint => ({ date: r.taken_at, value, flag: readingFlag(r) });

function seriesOf(readings: Reading[]): Series[] {
  const sorted = [...readings].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const out: Series[] = [];
  const bp = sorted.filter((r) => r.kind === "bp");
  if (bp.length) out.push({ key: "bp", label: "Blood pressure", readings: bp });
  for (const c of SUGAR_CONTEXTS) {
    const s = sorted.filter((r) => r.kind === "sugar" && (r.context ?? "random") === c.value);
    if (s.length) out.push({ key: c.value, label: `Blood sugar · ${c.label.toLowerCase()}`, readings: s });
  }
  return out;
}

function SeriesDetail({ s }: { s: Series }) {
  const [days, setDays] = useState<number>(90);
  const [all, setAll] = useState(false);
  const from = days ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
  const shown = s.readings.filter((r) => r.taken_at >= from);
  const isBp = s.key === "bp";
  const sugarLimit = isBp ? null : SUGAR_LIMITS[s.key as SugarContext];
  const list = [...shown].reverse();
  return (
    <div className="flex flex-col gap-4 border-t border-rule-soft pt-4 pb-2">
      <div className="flex gap-2" role="group" aria-label="Period">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            aria-pressed={days === r.days}
            onClick={() => setDays(r.days)}
            className={cn("h-8 rounded-sm border px-2.5 type-caption", days === r.days ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted")}
          >
            {r.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="type-label text-ink-faint">No readings in this period.</p>
      ) : isBp ? (
        <>
          <LabChart
            points={shown.map((r) => point(r, r.systolic!))}
            second={shown.map((r) => point(r, r.diastolic!))}
            low={null}
            high={null}
            limits={[
              // Labels would sit on the data (BP runs close to its limits); the legend names them.
              { value: BP_LIMITS.systolicHigh, label: "" },
              { value: BP_LIMITS.diastolicHigh, label: "" },
            ]}
            unit="mmHg"
            label="Blood pressure"
            valueText={(i) => `${readingText(shown[i])} mmHg${shown[i].pulse ? ` · pulse ${shown[i].pulse}` : ""}`}
          />
          <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full bg-(--chart-line)" /> Upper (systolic)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-(--chart-line) opacity-70" /> Lower (diastolic)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-dashed border-(--chart-band)" /> High from {BP_LIMITS.systolicHigh} / {BP_LIMITS.diastolicHigh}
            </span>
          </p>
        </>
      ) : (
        <>
          <LabChart
            points={shown.map((r) => point(r, r.sugar!))}
            low={sugarLimit!.low}
            high={sugarLimit!.high}
            unit="mg/dL"
            label={s.label}
            valueText={(i) => readingText(shown[i])}
          />
          <p className="-mt-2 flex items-center gap-2 type-caption text-ink-faint">
            <span aria-hidden className="inline-block h-3 w-5 rounded-[2px] bg-(--chart-band) opacity-20" />
            Usual range {sugarLimit!.text}
          </p>
        </>
      )}
      {list.length > 0 && (
        <table className="w-full type-label">
          <caption className="sr-only">{s.label} readings</caption>
          <tbody>
            {(all ? list : list.slice(0, 8)).map((r) => (
              <tr key={r.id} className="border-t border-rule-soft first:border-t-0">
                <td className="py-1.5 num text-[12px] whitespace-nowrap text-ink-muted">{when(r)}</td>
                <td className="py-1.5 text-right">
                  {"pending" in r ? (
                    // Saved on this phone while offline: it can be edited once it has been sent.
                    <span>
                      <span className="font-semibold">{readingText(r)}</span>
                      {r.pulse ? <span className="text-ink-faint"> · {r.pulse} bpm</span> : null}
                      <span className="block type-caption text-iris">Waiting to send</span>
                    </span>
                  ) : (
                    <Link to={`/readings/${r.id}`} className="hover:underline">
                      <span className="font-semibold">{readingText(r)}</span>
                      {r.pulse ? <span className="text-ink-faint"> · {r.pulse} bpm</span> : null}
                      {readingFlag(r) && <span className="text-ink-muted"> · {readingFlag(r) === "high" ? "High" : "Low"}</span>}
                    </Link>
                  )}
                  {r.notes && <span className="block type-caption text-ink-faint">{r.notes}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > 8 && !all && (
        <button type="button" onClick={() => setAll(true)} className="self-start type-label text-iris">
          Show all {list.length}
        </button>
      )}
    </div>
  );
}

/** Trends → Home readings: blood pressure and sugar logged at home, with quick log buttons. */
export function HomeReadings({ memberId }: { memberId: string }) {
  const q = useReadings(memberId);
  // Readings logged offline show at once, marked as waiting to send.
  const pending = (usePendingReadings().data ?? []).filter((r) => r.member_id === memberId);
  const all = [...(q.data ?? []), ...pending];
  const [open, setOpen] = useState<string | null>(null);
  const series = seriesOf(all);
  const current = open ?? series[0]?.key ?? null;
  const loggedToday = all.some((r) => r.taken_at.startsWith(today()));

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="meta text-ink-faint">Home readings</h2>
        {loggedToday && <span className="type-caption text-ink-faint">Logged today</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="secondary">
          <Link to={`/m/${memberId}/readings/new?kind=bp`}>
            <HeartPulse /> Log BP
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={`/m/${memberId}/readings/new?kind=sugar`}>
            <Droplet /> Log sugar
          </Link>
        </Button>
      </div>
      {series.length > 0 && (
        <div className="mt-3 rounded-sm border border-rule bg-sheet px-4">
          {series.map((s, i) => {
            const isOpen = current === s.key;
            const latest = s.readings[s.readings.length - 1];
            const pts = s.readings.slice(-12).map((r) => point(r, s.key === "bp" ? r.systolic! : r.sugar!));
            return (
              <div key={s.key} className={cn(i > 0 && "border-t border-rule-soft")}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? "" : s.key)} className="flex min-h-16 w-full items-center gap-3 py-2.5 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 type-body font-semibold">
                      {s.label} <FlagBadge flag={readingFlag(latest)} />
                    </span>
                    <span className="mt-0.5 block type-label text-ink-faint">
                      <span className="num text-ink">{readingText(latest)}</span>
                      {s.key === "bp" && " mmHg"} · {when(latest)}
                      <span className="block">{s.readings.length === 1 ? "1 reading" : `${s.readings.length} readings`}</span>
                    </span>
                  </span>
                  <Sparkline points={pts} />
                  <ChevronDown className={cn("size-5 shrink-0 text-ink-faint transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && <SeriesDetail s={s} />}
              </div>
            );
          })}
        </div>
      )}
      {series.length > 0 && <p className="mt-2 type-caption text-ink-faint">Ranges are general adult guidelines. Your doctor may set a different target.</p>}
    </section>
  );
}
