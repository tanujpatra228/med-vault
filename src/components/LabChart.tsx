import { useEffect, useMemo, useRef, useState } from "react";
import { formatValue } from "@shared/labs";
import { formatDate } from "@/lib/format";

export interface ChartPoint {
  date: string;
  value: number;
  flag: "high" | "low" | null;
}

export interface ChartMarker {
  date: string;
  label: string;
}

/** A dotted reference line, e.g. { value: 140, label: "high 140" }. */
export interface ChartLimit {
  value: number;
  label: string;
}

const PAD = { top: 22, right: 16, bottom: 24, left: 44 };
/** Axis labels that fit: 406000 → "4.1L", 7500 → "7.5K" (Indian compact notation), small numbers as they are. */
const compact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const axisLabel = (v: number) =>
  Math.abs(v) >= 10_000 ? compact.format(v) : formatValue(v);
const dayMonth = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});
const monthYear = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
});
/** Axis end labels: "10 Oct" within a year, "Oct 2026" across years (never "Oct 26", which reads as a day). */
const axisDate = (ms: number, spanMs: number) =>
  (spanMs < 300 * 86_400_000 ? dayMonth : monthYear).format(new Date(ms));
/** A date ("2026-10-17") or a local date-time ("2026-10-17T08:30", home readings), on one shared clock. */
const t = (d: string) =>
  Date.parse(d.length > 10 ? `${d.slice(0, 16)}:00Z` : `${d}T00:00:00Z`);

/** Clean tick values covering [lo, hi], about `count` of them. */
function ticks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step)
    out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(200, Math.round(e.contentRect.width))),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * One test over time: a 2px line with ringed points, the normal range as a soft band edged with
 * dotted lines at its limits (labelled at the right),
 * out-of-range points in the status color (with "High"/"Low" in the readout, never color alone),
 * medicine start/stop as hairline annotations, and a crosshair readout on hover or tap.
 */
export function LabChart({
  points,
  low,
  high,
  unit,
  markers = [],
  height = 200,
  label,
  second,
  limits,
  valueText,
}: {
  points: ChartPoint[];
  low: number | null;
  high: number | null;
  unit: string | null;
  markers?: ChartMarker[];
  height?: number;
  label: string;
  /** A second line on the same dates (blood pressure's lower number), drawn lighter with hollow points. */
  second?: ChartPoint[];
  /** Dotted lines instead of the normal range's min and max (an empty label draws the line only). */
  limits?: ChartLimit[];
  /** Readout text for point i ("138/86"); defaults to the value and unit. */
  valueText?: (i: number) => string;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    const vals = [...points, ...(second ?? [])].map((p) => p.value);
    const bandVals = [low, high, ...(limits ?? []).map((l) => l.value)].filter(
      (v): v is number => v !== null,
    );
    let lo = Math.min(...vals, ...bandVals);
    let hi = Math.max(...vals, ...bandVals);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
    // A range with only an upper limit ("< 5") starts at zero, so the band reads as 0 to 5.
    lo =
      lo >= 0 && (lo - pad < 0 || (low === null && high !== null))
        ? 0
        : lo - pad;
    hi += pad;
    const yt = ticks(lo, hi);
    lo = Math.min(lo, yt[0]);
    hi = Math.max(hi, yt[yt.length - 1]);
    const times = points.map((p) => t(p.date));
    let t0 = Math.min(...times);
    let t1 = Math.max(...times);
    if (t0 === t1) {
      t0 -= 15 * 86_400_000;
      t1 += 15 * 86_400_000;
    }
    const iw = width - PAD.left - PAD.right;
    const ih = height - PAD.top - PAD.bottom;
    const x = (d: string) => PAD.left + ((t(d) - t0) / (t1 - t0)) * iw;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * ih;
    return { x, y, yt, t0, t1, iw, ih, lo, hi };
  }, [points, second, limits, low, high, width, height]);

  const { x, y, yt } = geo;
  const pathOf = (pts: ChartPoint[]) =>
    pts
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`,
      )
      .join(" ");
  const path = pathOf(points);
  const lines: Array<ChartLimit & { above: boolean }> = limits
    ? limits.map((l, i) => ({ ...l, above: i === 0 }))
    : [
        ...(high !== null
          ? [{ value: high, label: `max ${axisLabel(high)}`, above: true }]
          : []),
        ...(low !== null
          ? [{ value: low, label: `min ${axisLabel(low)}`, above: false }]
          : []),
      ];
  const bandTop = high !== null ? y(Math.min(high, geo.hi)) : PAD.top;
  const bandBottom =
    low !== null ? y(Math.max(low, geo.lo)) : height - PAD.bottom;
  // Labels only where they fit; crowded markers keep their line (the list under the chart names them all).
  let lastLabelX = -Infinity;
  const visibleMarkers = markers
    .filter((m) => t(m.date) >= geo.t0 && t(m.date) <= geo.t1)
    .map((m) => {
      const mx = x(m.date);
      const labeled = mx - lastLabelX > 96;
      if (labeled) lastLabelX = mx;
      return { ...m, labeled };
    });
  const last = points[points.length - 1];

  const pick = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px))
        best = i;
    });
    setActive(best);
  };
  const a = active !== null ? points[active] : null;

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${label}: ${points.length} results, latest ${formatValue(last.value)}${unit ? ` ${unit}` : ""} on ${formatDate(last.date)}`}
        className="block touch-pan-y"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setActive(null)}
      >
        {(low !== null || high !== null) && (
          <rect
            x={PAD.left}
            y={bandTop}
            width={geo.iw}
            height={Math.max(0, bandBottom - bandTop)}
            fill="var(--chart-band)"
            opacity={0.1}
          />
        )}
        {yt.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--rule-soft)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-faint num text-[11px]"
            >
              {axisLabel(v)}
            </text>
          </g>
        ))}
        {lines.map(({ value: v, label: text, above }, i) => {
          if (v < geo.lo || v > geo.hi) return null;
          // Label at whichever end the data line is farther from, so it never sits on a point.
          const right =
            Math.abs(y(last.value) - y(v)) >=
            Math.abs(y(points[0].value) - y(v));
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--chart-band)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                opacity={0.9}
              />
              {text && (
                <text
                  x={right ? width - PAD.right - 2 : PAD.left + 4}
                  y={y(v)}
                  dy={above ? "-0.45em" : "1.15em"}
                  textAnchor={right ? "end" : "start"}
                  className="fill-ink-muted num text-[10px]"
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}
        {visibleMarkers.map((m, i) => (
          <g key={`${m.date}-${i}`}>
            <line
              x1={x(m.date)}
              x2={x(m.date)}
              y1={PAD.top - 4}
              y2={height - PAD.bottom}
              stroke="var(--ink-faint)"
              strokeWidth={1}
              opacity={0.5}
            />
            {m.labeled && (
              <text
                x={x(m.date)}
                y={PAD.top - 9}
                textAnchor={x(m.date) > width * 0.7 ? "end" : "start"}
                className="fill-ink-muted text-[10px]"
              >
                {m.label}
              </text>
            )}
          </g>
        ))}
        <text
          x={PAD.left}
          y={height - 6}
          className="fill-ink-faint text-[11px]"
        >
          {axisDate(geo.t0, geo.t1 - geo.t0)}
        </text>
        <text
          x={width - PAD.right}
          y={height - 6}
          textAnchor="end"
          className="fill-ink-faint text-[11px]"
        >
          {axisDate(geo.t1, geo.t1 - geo.t0)}
        </text>
        {a && (
          <line
            x1={x(a.date)}
            x2={x(a.date)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--ink-muted)"
            strokeWidth={1}
          />
        )}
        {second && (
          <path
            d={pathOf(second)}
            fill="none"
            stroke="var(--chart-line)"
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {second?.map((p, i) => (
          <circle
            key={`s${i}`}
            cx={x(p.date)}
            cy={y(p.value)}
            r={active === i ? 5.5 : 4}
            fill="var(--sheet)"
            stroke={p.flag ? "var(--chart-out)" : "var(--chart-line)"}
            strokeWidth={2}
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke="var(--chart-line)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.date)}
            cy={y(p.value)}
            r={active === i ? 6 : 4.5}
            fill={p.flag ? "var(--chart-out)" : "var(--chart-line)"}
            stroke="var(--sheet)"
            strokeWidth={2}
          />
        ))}
      </svg>
      {a && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-sm border border-rule bg-sheet px-2.5 py-1.5 shadow-sm"
          style={{
            left: Math.min(Math.max(x(a.date) - 70, 0), width - 140),
            width: 140,
          }}
          role="status"
        >
          <div className="type-label font-semibold text-ink">
            {valueText
              ? valueText(active!)
              : `${formatValue(a.value)} ${unit ?? ""}`}
            {a.flag && (
              <span className="ml-1.5 font-normal text-ink-muted">
                · {a.flag === "high" ? "High" : "Low"}
              </span>
            )}
          </div>
          <div className="type-caption text-ink-faint">
            {formatDate(a.date)}
            {a.date.length > 10 && `, ${a.date.slice(11, 16)}`}
          </div>
        </div>
      )}
    </div>
  );
}

/** A tiny trend line for a list row: the shape only, last point marked. */
export function Sparkline({
  points,
  width = 72,
  height = 28,
}: {
  points: ChartPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const t0 = t(points[0].date);
  const t1 = t(points[points.length - 1].date) || t0 + 1;
  const x = (d: string) => 4 + ((t(d) - t0) / (t1 - t0 || 1)) * (width - 8);
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (height - 8);
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="shrink-0">
      <path
        d={points
          .map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.value)}`)
          .join(" ")}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={0.7}
      />
      <circle
        cx={x(last.date)}
        cy={y(last.value)}
        r={3}
        fill={last.flag ? "var(--chart-out)" : "var(--chart-line)"}
      />
    </svg>
  );
}
