import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { BP_LIMITS, readingFlag, readingText, SUGAR_LIMITS, type Reading } from "@shared/readings";
import { useMembers, useReadings } from "@/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { usePendingReadings } from "@/lib/offline/useOnline";
import { Section } from "@/components/layout";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Color follows the person (family order), the same on every chart; beyond four, a neutral bar. */
const MEMBER_COLORS = ["var(--member-1)", "var(--member-2)", "var(--member-3)", "var(--member-4)"];
const PERIODS = [14, 30, 90] as const;
const PAD = { left: 40, right: 8 };
const BP_H = 76;
const SUGAR_H = 54;
const GAP = 22;

/** Local "2026-10-17T08:30" on one shared clock (same as the other charts). */
const ms = (d: string) => Date.parse(`${d.slice(0, 16)}:00Z`);
const localNowMs = () => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
};
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (r: Reading) => `${formatDate(r.taken_at)}, ${r.taken_at.slice(11, 16)}`;
const sugarLimit = (r: Reading) => SUGAR_LIMITS[r.context ?? "random"].high;
const contextLabel = (r: Reading) => ({ fasting: "fasting", after_meal: "after meal", random: "random" })[r.context ?? "random"];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Scale [lo, hi] that always shows the limits and every value, padded a little. */
function domain(values: number[], floor: number, ceil: number) {
  return { lo: Math.min(floor, ...values) - 5, hi: Math.max(ceil, ...values) + 5 };
}

/**
 * One person: BP as a bar from the lower to the upper number per reading, and sugar underneath on its
 * own scale, both on the same date line. Fasting sugar is a filled dot, after-meal and random hollow;
 * anything over its limit is drawn in the status color. Tap or drag for the readings at that time.
 */
function PersonCard({ name, memberId, color, bp, sugar, t0, t1 }: { name: string; memberId: string; color: string; bp: Reading[]; sugar: Reading[]; t0: number; t1: number }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const hasSugar = sugar.length > 0;
  const height = 8 + BP_H + (hasSugar ? GAP + SUGAR_H : 0) + 18;
  const x = (d: string) => PAD.left + ((ms(d) - t0) / (t1 - t0)) * (width - PAD.left - PAD.right);

  const bpD = domain(bp.flatMap((r) => [r.systolic!, r.diastolic!]), BP_LIMITS.systolicLow - 20, BP_LIMITS.systolicHigh + 10);
  const bpY = (v: number) => 8 + (1 - (v - bpD.lo) / (bpD.hi - bpD.lo)) * BP_H;
  const s0 = 8 + BP_H + GAP;
  const sgD = domain(sugar.map((r) => r.sugar!), 70, 180);
  const sgY = (v: number) => s0 + (1 - (v - sgD.lo) / (sgD.hi - sgD.lo)) * SUGAR_H;

  const latestBp = bp[bp.length - 1];
  const latestSugar = sugar[sugar.length - 1];
  const all = [...bp, ...sugar];
  const pick = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left;
    const t = t0 + ((px - PAD.left) / (width - PAD.left - PAD.right)) * (t1 - t0);
    setActive(all.reduce((best, r) => (Math.abs(ms(r.taken_at) - t) < Math.abs(best - t) ? ms(r.taken_at) : best), ms(all[0].taken_at)));
  };
  // Readout: the readings nearest the chosen time, within half a day.
  const near = (rs: Reading[]) => (active === null ? null : (rs.find((r) => Math.abs(ms(r.taken_at) - active) <= 12 * 3_600_000) ?? null));
  const aBp = near([...bp].sort((a, b) => Math.abs(ms(a.taken_at) - (active ?? 0)) - Math.abs(ms(b.taken_at) - (active ?? 0))));
  const aSugar = near([...sugar].sort((a, b) => Math.abs(ms(a.taken_at) - (active ?? 0)) - Math.abs(ms(b.taken_at) - (active ?? 0))));

  const limitLine = (y: number, label: string, key: string) => (
    <g key={key}>
      <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke="var(--chart-out)" strokeDasharray="3 3" opacity={0.7} />
      <text x={PAD.left - 6} y={y} dy="0.32em" textAnchor="end" className="fill-ink-faint num text-[10px]">
        {label}
      </text>
    </g>
  );

  return (
    <div className="rounded-sm border border-rule bg-sheet px-3 pt-2.5 pb-2">
      <Link to={`/m/${memberId}/trends`} className="flex min-h-11 items-center gap-2 rounded-sm">
        <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
        <span className="type-body font-semibold">{name}</span>
        <span className="ml-auto text-right type-caption text-ink-faint">
          {latestBp && (
            <>
              BP <span className={cn("num font-medium", readingFlag(latestBp) ? "text-rust" : "text-ink")}>{readingText(latestBp)}</span>
            </>
          )}
          {latestBp && latestSugar && " · "}
          {latestSugar && (
            <>
              sugar <span className={cn("num font-medium", readingFlag(latestSugar) ? "text-rust" : "text-ink")}>{latestSugar.sugar}</span> {contextLabel(latestSugar)}
            </>
          )}
          <span className="block">latest</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-faint" />
      </Link>
      <div ref={ref} className="relative select-none">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${name}: ${bp.length} blood pressure readings${latestBp ? `, latest ${readingText(latestBp)}` : ""}; ${sugar.length} sugar readings${latestSugar ? `, latest ${latestSugar.sugar} mg/dL` : ""}`}
          className="block touch-pan-y"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
        >
          {/* BP: normal zone, limits, one bar per reading */}
          <text x={0} y={12} className="fill-ink-muted text-[10px] font-semibold">
            BP
          </text>
          {bp.length > 0 ? (
            <>
              <rect x={PAD.left} y={bpY(BP_LIMITS.systolicHigh)} width={width - PAD.left - PAD.right} height={bpY(BP_LIMITS.diastolicHigh) - bpY(BP_LIMITS.systolicHigh)} fill="var(--chart-band)" opacity={0.1} />
              {limitLine(bpY(BP_LIMITS.systolicHigh), String(BP_LIMITS.systolicHigh), "s")}
              {limitLine(bpY(BP_LIMITS.diastolicHigh), String(BP_LIMITS.diastolicHigh), "d")}
              {bp.map((r) => {
                const cx = x(r.taken_at);
                return (
                  <g key={r.id}>
                    <line x1={cx} x2={cx} y1={bpY(r.systolic!)} y2={bpY(r.diastolic!)} stroke={color} strokeWidth={4} strokeLinecap="round" />
                    {readingFlag(r) && <circle cx={cx} cy={bpY(readingFlag(r) === "low" ? r.diastolic! : r.systolic!)} r={3} fill="var(--chart-out)" stroke="var(--sheet)" strokeWidth={1.5} />}
                  </g>
                );
              })}
            </>
          ) : (
            <text x={(PAD.left + width) / 2} y={8 + BP_H / 2} textAnchor="middle" className="fill-ink-faint text-[11px] italic">
              No blood pressure readings
            </text>
          )}

          {/* Sugar: its own scale, same date line */}
          {hasSugar && (
            <>
              <line x1={PAD.left} x2={width - PAD.right} y1={s0 - GAP / 2} y2={s0 - GAP / 2} stroke="var(--rule-soft)" />
              <text x={0} y={s0 + 4} className="fill-ink-muted text-[10px] font-semibold">
                Sugar
              </text>
              {limitLine(sgY(SUGAR_LIMITS.fasting.high), String(SUGAR_LIMITS.fasting.high), "f")}
              {limitLine(sgY(SUGAR_LIMITS.after_meal.high), String(SUGAR_LIMITS.after_meal.high), "m")}
              {(["fasting", "other"] as const).map((k) => {
                const pts = sugar.filter((r) => (k === "fasting" ? r.context === "fasting" : r.context !== "fasting"));
                return pts.length > 1 ? (
                  <path
                    key={k}
                    d={pts.map((r, i) => `${i ? "L" : "M"}${x(r.taken_at).toFixed(1)},${sgY(r.sugar!).toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray={k === "fasting" ? undefined : "2 3"}
                    opacity={0.5}
                  />
                ) : null;
              })}
              {sugar.map((r) => {
                const over = r.sugar! >= sugarLimit(r) || readingFlag(r) === "low";
                const c = over ? "var(--chart-out)" : color;
                return r.context === "fasting" ? (
                  <circle key={r.id} cx={x(r.taken_at)} cy={sgY(r.sugar!)} r={4} fill={c} stroke="var(--sheet)" strokeWidth={1.5} />
                ) : (
                  <circle key={r.id} cx={x(r.taken_at)} cy={sgY(r.sugar!)} r={3.4} fill="var(--sheet)" stroke={c} strokeWidth={2} />
                );
              })}
            </>
          )}

          {active !== null && <line x1={PAD.left + ((active - t0) / (t1 - t0)) * (width - PAD.left - PAD.right)} x2={PAD.left + ((active - t0) / (t1 - t0)) * (width - PAD.left - PAD.right)} y1={6} y2={height - 18} stroke="var(--ink-muted)" />}
          <text x={PAD.left} y={height - 4} className="fill-ink-faint text-[10px]">
            {dayMonth.format(new Date(t0))}
          </text>
          <text x={width - PAD.right} y={height - 4} textAnchor="end" className="fill-ink-faint text-[10px]">
            Today
          </text>
        </svg>
        {active !== null && (aBp || aSugar) && (
          <div className="pointer-events-none absolute top-0 right-0 z-10 rounded-sm border border-rule bg-sheet px-2.5 py-1.5 type-caption shadow-sm" role="status">
            <div className="text-ink-faint">{when(aBp ?? aSugar!)}</div>
            {aBp && (
              <div className="text-ink">
                BP <span className="num font-semibold">{readingText(aBp)}</span>
                {readingFlag(aBp) && <span className="text-rust"> · {readingFlag(aBp) === "high" ? "High" : "Low"}</span>}
              </div>
            )}
            {aSugar && (
              <div className="text-ink">
                Sugar <span className="num font-semibold">{aSugar.sugar}</span> {contextLabel(aSugar)}
                {readingFlag(aSugar) && <span className="text-rust"> · {readingFlag(aSugar) === "high" ? "High" : "Low"}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Home → one card per family member with blood pressure and sugar on a shared date line. */
export function FamilyVitals() {
  const members = useMembers();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  // One request for the longest period; shorter periods filter it here.
  const qc = useQueryClient();
  const q = useReadings("", new Date(Date.now() - PERIODS[PERIODS.length - 1] * 86_400_000).toISOString().slice(0, 10));
  const pending = usePendingReadings().data ?? [];
  // Offline on a later day the query's date (and key) differ from the saved one: fall back to any saved family readings.
  const saved = q.data ?? qc.getQueriesData<Reading[]>({ queryKey: ["readings", ""] }).find(([, d]) => d?.length)?.[1];
  const loaded = [...(saved ?? []), ...pending];
  if (!members.data || !loaded.length) return null;

  // Same window for every card, so the same day sits in the same place on each.
  const t1 = localNowMs();
  const t0 = t1 - days * 86_400_000;
  const readings = loaded.filter((r) => ms(r.taken_at) >= t0);
  const byTime = (a: Reading, b: Reading) => a.taken_at.localeCompare(b.taken_at);
  const cards = members.data
    .map((p, i) => ({
      p,
      color: MEMBER_COLORS[i] ?? "var(--ink-faint)",
      bp: readings.filter((r) => r.member_id === p.id && r.kind === "bp").sort(byTime),
      sugar: readings.filter((r) => r.member_id === p.id && r.kind === "sugar").sort(byTime),
    }))
    .filter((c) => c.bp.length || c.sugar.length);

  return (
    <Section
      title="Blood pressure & sugar"
      className="mt-8"
      action={
        <div className="flex gap-1.5" role="group" aria-label="Period">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn("h-8 rounded-sm border px-2.5 type-caption", days === d ? "border-ink bg-ink text-paper" : "border-rule bg-sheet text-ink-muted")}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {cards.length ? (
        <div className="flex flex-col gap-2.5">
          {cards.map((c) => (
            <PersonCard key={c.p.id} name={c.p.name} memberId={c.p.id} color={c.color} bp={c.bp} sugar={c.sugar} t0={t0} t1={t1} />
          ))}
        </div>
      ) : (
        <p className="type-label text-ink-faint">No readings in the last {days} days.</p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-ink-faint">
        <span className="flex items-center gap-1.5">
          <svg width={8} height={12} aria-hidden>
            <line x1={4} x2={4} y1={1.5} y2={10.5} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
          </svg>
          BP lower to upper
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={10} height={10} aria-hidden>
            <circle cx={5} cy={5} r={4} fill="currentColor" />
          </svg>
          Sugar fasting
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={10} height={10} aria-hidden>
            <circle cx={5} cy={5} r={3.2} fill="none" stroke="currentColor" strokeWidth={1.6} />
          </svg>
          After meal or random
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={10} height={10} aria-hidden>
            <circle cx={5} cy={5} r={4} fill="var(--chart-out)" />
          </svg>
          Out of range
        </span>
      </p>
      <p className="mt-1 type-caption text-ink-faint">Limits: BP 140/90; sugar 100 fasting, 140 after a meal. General adult guidelines; a doctor may set a different target.</p>
    </Section>
  );
}
