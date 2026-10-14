import { toast } from "sonner";
import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import type { ReviewItem, ReviewLevel } from "@shared/review";
import { useReview, useRunReview } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/layout";
import { cn } from "@/lib/utils";
import { countWord, relativeDays } from "@/lib/format";

const LEVEL: Record<ReviewLevel, { label: string; variant: "warn" | "focus" | "neutral" }> = {
  talk_soon: { label: "Ask soon", variant: "warn" },
  ask: { label: "Next visit", variant: "focus" },
  note: { label: "Good to know", variant: "neutral" },
};

export function ReviewItemCard({ item, compact = false }: { item: ReviewItem; compact?: boolean }) {
  const level = LEVEL[item.level];
  return (
    <li className={cn("rounded-sm border bg-sheet p-3 break-inside-avoid", item.level === "talk_soon" ? "border-rust" : "border-rule")}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge variant={level.variant}>{level.label}</Badge>
        <span className="type-caption text-ink-faint">{item.medicines.join(" · ")}</span>
      </div>
      <p className="type-body font-semibold">{item.question}</p>
      {!compact && item.why && <p className="mt-1 type-label text-ink-muted">{item.why}</p>}
    </li>
  );
}

export const REVIEW_DISCLAIMER = "Questions to ask, not medical advice. Never stop or change a medicine without asking the doctor.";

/** "Questions for the doctor": checks every current medicine, from every doctor, against each other. */
export function AskDoctorSection({ memberId, name, medCount, doctorCount }: { memberId: string; name: string; medCount: number; doctorCount: number }) {
  const q = useReview(memberId);
  const run = useRunReview(memberId);
  if (medCount === 0 || q.isPending || q.isError) return null;
  const { review, stale } = q.data;

  const check = () =>
    run.mutate(undefined, {
      onSuccess: (d) => {
        if (!d.review?.model) toast("AI was not available, so only the built-in checks ran.");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not check the medicines"),
    });

  const button = (label: string) => (
    <Button variant="secondary" className="w-full" onClick={check} disabled={run.isPending}>
      {review ? <RefreshCw className={run.isPending ? "animate-spin" : ""} /> : <MessageCircleQuestion />}
      {run.isPending ? "Checking…" : label}
    </Button>
  );

  return (
    <Section title="Questions for the doctor">
      {!review ? (
        <div className="flex flex-col gap-3">
          <p className="type-label text-ink-muted">
            Check how {name}'s {medCount === 1 ? "medicine fits" : `${countWord(medCount)} medicines${doctorCount > 1 ? ` from ${countWord(doctorCount)} doctors` : ""} work together`} with the
            recorded allergies and conditions. You get questions to ask at the next visit.
          </p>
          {button("Check the medicines")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {stale && <p className="rounded-sm border border-iris bg-iris-surface px-3 py-2 type-label">Medicines, allergies or conditions changed since this check.</p>}
          {review.items.length ? (
            <ul className="flex flex-col gap-2">
              {review.items.map((item, i) => (
                <ReviewItemCard key={i} item={item} />
              ))}
            </ul>
          ) : (
            <p className="rounded-sm border border-moss bg-moss-surface px-3 py-2 type-label text-moss">Nothing stood out. Still mention every medicine to each doctor.</p>
          )}
          <p className="type-caption text-ink-faint">
            Checked {relativeDays(review.checked_at)} · {review.model ? "built-in checks and AI" : "built-in checks only"}. {REVIEW_DISCLAIMER}
          </p>
          {stale ? button("Check again") : null}
        </div>
      )}
    </Section>
  );
}
