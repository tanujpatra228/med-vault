import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { readingFlag, SUGAR_CONTEXTS, BP_LIMITS, SUGAR_LIMITS, type Reading, type ReadingKind, type SugarContext } from "@shared/readings";
import { useDelete, useReading, useSave } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/Field";
import { FormPage } from "@/components/FormPage";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { FlagBadge } from "@/components/LabValuesEditor";
import { Loading } from "@/components/layout";
import { nowLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toPayload, useFields, useLoadRecord } from "@/lib/useFields";

const KINDS: Array<{ value: ReadingKind; label: string }> = [
  { value: "bp", label: "Blood pressure" },
  { value: "sugar", label: "Blood sugar" },
];

const n = (s: string) => (s.trim() === "" ? null : Number(s));

/** Log a home reading: blood pressure (upper, lower, pulse) or blood sugar (value and when). */
export function ReadingForm() {
  const { memberId: newFor, readingId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useReading(readingId);
  const save = useSave<Reading>("readings");
  const del = useDelete("readings");
  const f = useFields({ kind: params.get("kind") === "sugar" ? "sugar" : "bp", taken_at: nowLocal(), systolic: "", diastolic: "", pulse: "", sugar: "", context: "fasting", notes: "" });
  useLoadRecord(existing.data && { ...existing.data, taken_at: existing.data.taken_at.slice(0, 16) }, f);
  if (readingId && existing.isPending) return <Loading />;
  const memberId = newFor ?? existing.data?.member_id ?? "";
  const back = () => navigate(`/m/${memberId}/trends`, { replace: true });
  const kind = f.values.kind as ReadingKind;
  const flag = readingFlag({ kind, systolic: n(f.values.systolic), diastolic: n(f.values.diastolic), sugar: n(f.values.sugar), context: f.values.context as SugarContext });

  return (
    <FormPage
      title="Reading"
      heading={readingId ? "Edit reading" : "Log a reading"}
      submitLabel="Save reading"
      onSubmit={async () => {
        await save.mutateAsync({ id: readingId, data: { ...toPayload(f.values), member_id: memberId } });
        toast.success("Reading saved");
        back();
      }}
      footer={readingId && <ConfirmDelete what="this reading" onConfirm={async () => (await del.mutateAsync(readingId), back())} />}
    >
      {!readingId && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="What did you measure?">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => f.set("kind", k.value)}
              className={cn("flex h-12 items-center justify-center gap-1.5 rounded-sm border type-label", kind === k.value ? "border-iris bg-iris-surface text-ink" : "border-rule bg-sheet text-ink-muted")}
            >
              {kind === k.value && <Check className="size-4 text-iris" />}
              {k.label}
            </button>
          ))}
        </div>
      )}

      {kind === "bp" ? (
        <>
          <FieldRow>
            <Field label="Upper (systolic)" required>
              <Input inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 128" className="num text-lg" {...f.bind("systolic")} />
            </Field>
            <Field label="Lower (diastolic)" required>
              <Input inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 82" className="num text-lg" {...f.bind("diastolic")} />
            </Field>
          </FieldRow>
          <Field label="Pulse" hint="Beats per minute, if the machine shows it">
            <Input inputMode="numeric" pattern="[0-9]*" placeholder="e.g. 72" className="num" {...f.bind("pulse")} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Sugar (mg/dL)" required>
            <Input inputMode="decimal" placeholder="e.g. 104" className="num text-lg" {...f.bind("sugar")} />
          </Field>
          <Field label="When was it taken?">
            <div className="flex flex-col gap-2" role="group" aria-label="When was it taken?">
              {SUGAR_CONTEXTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={f.values.context === c.value}
                  onClick={() => f.set("context", c.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-3 py-2 text-left",
                    f.values.context === c.value ? "border-iris bg-iris-surface" : "border-rule bg-sheet",
                  )}
                >
                  <Check className={cn("size-4 shrink-0 text-iris", f.values.context !== c.value && "invisible")} />
                  <span>
                    <span className="block type-label text-ink">{c.label}</span>
                    <span className="block type-caption text-ink-faint">{c.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {flag && (
        <p className="flex items-center gap-2 type-label text-ink-muted" role="status">
          <FlagBadge flag={flag} />
          {kind === "bp"
            ? `Usual adult range is below ${BP_LIMITS.systolicHigh}/${BP_LIMITS.diastolicHigh} and above ${BP_LIMITS.systolicLow}/${BP_LIMITS.diastolicLow}.`
            : `Usual range is ${SUGAR_LIMITS[f.values.context as SugarContext]?.text ?? SUGAR_LIMITS.random.text}.`}{" "}
          Your doctor may set a different target.
        </p>
      )}

      <Field label="Taken at" required>
        <Input type="datetime-local" max={nowLocal()} {...f.bind("taken_at")} />
      </Field>
      <Field label="Note" hint="e.g. after walking, missed the morning tablet">
        <Input {...f.bind("notes")} />
      </Field>
    </FormPage>
  );
}
