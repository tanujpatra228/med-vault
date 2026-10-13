import { describe, type Schedule } from "@shared/schedule";
import { cn } from "@/lib/utils";

/** Plain-language schedule, phase by phase. Used on the medicine page and as the editor preview. */
export function ScheduleDetails({
  schedule,
  start,
  timing,
  form,
  className,
}: {
  schedule: Schedule;
  start: string | null;
  timing?: string | null;
  form?: string | null;
  className?: string;
}) {
  const phases = describe(schedule, start, { timing, form });
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {phases.map((p, i) => (
        <div key={i}>
          {p.heading && <div className="meta mb-1 text-ink-faint">{p.heading}</div>}
          {p.lines.map((line, j) => (
            <p key={j} className="type-body text-ink">
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
