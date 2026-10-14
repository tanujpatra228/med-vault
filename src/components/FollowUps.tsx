import { Phone } from "lucide-react";
import type { FollowUp } from "@shared/types";
import { useFollowUps } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { formatDate, today } from "@/lib/format";

/** Days from today to a date (negative = past). */
export function daysUntil(date: string, from = today()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function dueLabel(date: string): { text: string; variant: "warn" | "focus" | "neutral" } {
  const d = daysUntil(date);
  if (d < 0) return { text: `Overdue · ${-d} ${d === -1 ? "day" : "days"}`, variant: "warn" };
  if (d === 0) return { text: "Today", variant: "warn" };
  if (d === 1) return { text: "Tomorrow", variant: "focus" };
  if (d <= 14) return { text: `In ${d} days`, variant: "focus" };
  return { text: formatDate(date), variant: "neutral" };
}

function FollowUpRow({ f, showMember }: { f: FollowUp; showMember: boolean }) {
  const due = dueLabel(f.follow_up_on);
  return (
    <Row
      to={`/visits/${f.visit_id}`}
      title={[showMember ? f.member_name : null, f.doctor_name ?? "Follow-up visit"].filter(Boolean).join(" · ")}
      subtitle={
        <span className="flex flex-col gap-1">
          <span>
            <Badge variant={due.variant}>{due.text}</Badge>
            {due.variant !== "neutral" && <span className="ml-2 num text-[12px]">{formatDate(f.follow_up_on)}</span>}
          </span>
          {(f.doctor_specialty || f.follow_up_note) && <span>{[f.doctor_specialty, f.follow_up_note].filter(Boolean).join(" · ")}</span>}
        </span>
      }
      action={
        f.doctor_phone ? (
          <a href={`tel:${f.doctor_phone}`} aria-label={`Call ${f.doctor_name ?? "the doctor"}`} className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-rule">
            <Phone className="size-5" />
          </a>
        ) : undefined
      }
    />
  );
}

/** Open follow-ups: overdue and upcoming. Home shows the whole family; a profile shows one member. */
export function FollowUpsSection({ memberId, title = "Follow-ups", limit = 5 }: { memberId?: string; title?: string; limit?: number }) {
  const q = useFollowUps(memberId);
  if (!q.data?.length) return null;
  return (
    <Section title={title}>
      <RowList>
        {q.data.slice(0, limit).map((f) => (
          <FollowUpRow key={f.visit_id} f={f} showMember={!memberId} />
        ))}
      </RowList>
      {q.data.length > limit && <p className="mt-2 type-caption text-ink-faint">and {q.data.length - limit} more</p>}
    </Section>
  );
}
