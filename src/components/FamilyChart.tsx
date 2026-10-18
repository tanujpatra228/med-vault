import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import type { ChartLimit } from "@/components/LabChart";

export type MarkerShape = "circle" | "square" | "triangle" | "diamond";

export interface FamilyPoint {
  /** Local date-time, "2026-10-17T08:30". */
  date: string;
  value: number;
  /** Readout text, e.g. "138/86 · High". */
  text: string;
}

export interface FamilySeries {
  id: string;
  name: string;
  color: string;
  shape: MarkerShape;
  points: FamilyPoint[]; // oldest first
}

const PAD = { top: 16, right: 64, bottom: 24, left: 36 };
const t = (d: string) => Date.parse(`${d.slice(0, 16)}:00Z`);
const dayMonth = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

function ticks(lo: number, hi: number, count = 4): number[] {
  const raw = (hi - lo || 1) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** An 8px marker in one of four shapes (secondary encoding: identity never rests on color alone). */
export function Marker({ shape, x, y, color, size = 8, ring = true }: { shape: MarkerShape; x: number; y: number; color: string; size?: number; ring?: boolean }) {
  const r = size / 2;
  const common = { fill: color, stroke: ring ? "var(--sheet)" : "none", strokeWidth: ring ? 2 : 0, paintOrder: "stroke" as const };
  if (shape === "square") return <rect x={x - r} y={y - r} width={size} height={size} rx={1} {...common} />;
  if (shape === "triangle") return <path d={`M${x},${y - r * 1.15} L${x + r * 1.1},${y + r * 0.85} L${x - r * 1.1},${y + r * 0.85} Z`} {...common} />;
  if (shape === "diamond") return <path d={`M${x},${y - r * 1.25} L${x + r * 1.1},${y} L${x},${y + r * 1.25} L${x - r * 1.1},${y} Z`} {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

/**
 * Several family members on one chart, one y-axis: a 2px line per person in their own color and marker
 * shape, names at the line ends, dotted reference lines, and a crosshair readout listing everyone's
 * reading nearest that day.
 */
export function FamilyChart({ series, limits = [], unit, label, height = 220 }: { series: FamilySeries[]; limits?: ChartLimit[]; unit: string; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [activeT, setActiveT] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const vals = [...all.map((p) => p.value), ...limits.map((l) => l.value)];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo || 10) * 0.12;
    lo -= pad;
    hi += pad;
    const yt = ticks(lo, hi);
    lo = Math.min(lo, yt[0]);
    hi = Math.max(hi, yt[yt.length - 1]);
    const times = all.map((p) => t(p.date));
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    if (t1 - t0 < 2 * 86_400_000) {
      t0 -= 86_400_000;
      t1 += 86_400_000;
    }
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (ms: number) => PAD.left + ((ms - t0) / (t1 - t0)) * iw;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * ih;
    return { x, y, yt, t0, t1, lo, hi, times };
  }, [series, limits, width, height]);

  const { x, y } = geo;
  // Names at the end of each line, nudged apart so they never overlap.
  const ends = series
    .filter((s) => s.points.length)
    .map((s) => ({ s, y: y(s.points[s.points.length - 1].value) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const ms = geo.t0 + ((clientX - el.getBoundingClientRect().left - PAD.left) / (width - PAD.left - PAD.right)) * (geo.t1 - geo.t0);
    const nearest = geo.times.reduce((best, tm) => (Math.abs(tm - ms) < Math.abs(best - ms) ? tm : best), geo.times[0]);
    setActiveT(nearest);
  };
  const readout =
    activeT === null
      ? []
      : series
          .map((s) => {
            const p = s.points.reduce<FamilyPoint | null>((best, q) => (!best || Math.abs(t(q.date) - activeT) < Math.abs(t(best.date) - activeT) ? q : best), null);
            return p && Math.abs(t(p.date) - activeT) <= 36 * 3_600_000 ? { s, p } : null;
          })
          .filter((r): r is { s: FamilySeries; p: FamilyPoint } => r !== null);

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${series.map((s) => `${s.name} latest ${s.points[s.points.length - 1]?.text ?? "none"}`).join("; ")}`}
        className="block touch-pan-y"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setActiveT(null)}
      >
        {geo.yt.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--rule-soft)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-faint num text-[11px]">
              {v}
            </text>
          </g>
        ))}
        {limits.map((l, i) =>
          l.value < geo.lo || l.value > geo.hi ? null : (
            <line key={i} x1={PAD.left} x2={width - PAD.right} y1={y(l.value)} y2={y(l.value)} stroke="var(--chart-band)" strokeWidth={1.5} strokeDasharray="4 4" />
          ),
        )}
        <text x={PAD.left} y={height - 6} className="fill-ink-faint text-[11px]">
          {dayMonth.format(new Date(geo.t0))}
        </text>
        <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-ink-faint text-[11px]">
          {dayMonth.format(new Date(geo.t1))}
        </text>
        {activeT !== null && <line x1={x(activeT)} x2={x(activeT)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--ink-muted)" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.id}>
            <path
              d={s.points.map((p, i) => `${i ? "L" : "M"}${x(t(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p, i) => (
              <Marker key={i} shape={s.shape} x={x(t(p.date))} y={y(p.value)} color={s.color} />
            ))}
          </g>
        ))}
        {ends.map(({ s, y: ly }) => (
          <text key={s.id} x={x(t(s.points[s.points.length - 1].date)) + 9} y={ly} dy="0.32em" className="fill-ink-muted text-[11px] font-medium">
            {s.name.length > 8 ? `${s.name.slice(0, 7)}…` : s.name}
          </text>
        ))}
      </svg>
      {readout.length > 0 && activeT !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-sm border border-rule bg-sheet px-2.5 py-1.5 shadow-sm"
          style={{ left: Math.min(Math.max(x(activeT) - 85, 0), width - 170), width: 170 }}
          role="status"
        >
          <div className="mb-0.5 type-caption text-ink-faint">{formatDate(new Date(activeT).toISOString().slice(0, 10))}</div>
          {readout.map(({ s, p }) => (
            <div key={s.id} className="flex items-center gap-1.5 type-label text-ink">
              <svg width={10} height={10} aria-hidden className="shrink-0">
                <Marker shape={s.shape} x={5} y={5} color={s.color} size={8} ring={false} />
              </svg>
              <span className="truncate">{s.name}</span>
              <span className="ml-auto font-semibold whitespace-nowrap">{p.text}</span>
            </div>
          ))}
          <div className="type-caption text-ink-faint">{unit}</div>
        </div>
      )}
    </div>
  );
}
