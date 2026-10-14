import { useAiUsage } from "@/api/hooks";

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

/** Settings → AI today: the vault's daily Workers AI allowance, in neurons. */
export function AiUsageCard() {
  const q = useAiUsage();
  if (!q.data) return null;
  const { used, limit, left, scans_left, resets_at } = q.data;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-body">
          <span className="num">{used.toLocaleString("en-IN")}</span> of <span className="num">{limit.toLocaleString("en-IN")}</span> used
        </span>
        <span className="type-caption text-ink-faint">resets {timeFmt.format(new Date(resets_at))}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-rule-soft" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div className={pct >= 90 ? "h-full bg-rust" : "h-full bg-iris"} style={{ width: `${pct}%` }} />
      </div>
      <p className="type-caption text-ink-faint">
        {left > 0 ? `Enough for about ${scans_left} more prescription ${scans_left === 1 ? "scan" : "scans"} today.` : "Used up for today. Forms still work by hand."} A scan uses about 80 to 100 units
        (Cloudflare "neurons"), a medicine check about 50. Shared fairly between all families using this app.
      </p>
    </div>
  );
}
