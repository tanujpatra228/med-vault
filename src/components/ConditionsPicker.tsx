import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import type { Condition } from "@shared/types";
import { useConditions, useSave } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { cn } from "@/lib/utils";
import { sameName } from "@/lib/format";

/** Comma-separated ids (as the API returns them) to a list. */
export const splitIds = (s: string | null | undefined): string[] => (s ? s.split(",").filter(Boolean) : []);

/**
 * Pick any number of the member's health conditions as chips, or add a new one inline.
 * `suggestions` (diagnoses read by AI) select matching conditions automatically; the rest wait
 * with Add / Skip, and `onSuggestionsChange` reports what is still waiting so a form can block
 * saving until each is decided (nothing the AI read is dropped silently).
 */
export function ConditionsPicker({
  memberId,
  value,
  onChange,
  label = "For which conditions",
  suggestions = [],
  onSuggestionsChange,
}: {
  memberId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  suggestions?: string[];
  onSuggestionsChange?: (waiting: string[]) => void;
}) {
  const conditions = useConditions(memberId);
  const save = useSave<Condition>("conditions");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = conditions.data ?? [];

  // Diagnoses that match an existing condition are simply selected.
  useEffect(() => {
    if (!suggestions.length || !conditions.data) return;
    const matched = conditions.data.filter((c) => suggestions.some((s) => sameName(c.name, s)));
    if (!matched.length) return;
    onChange([...new Set([...value, ...matched.map((c) => c.id)])]);
    onSuggestionsChange?.(suggestions.filter((s) => !matched.some((c) => sameName(c.name, s))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.join("|"), conditions.isSuccess]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const create = async (n: string, fromSuggestion = false) => {
    if (!n.trim()) return toast.error("Condition name is required");
    setBusy(true);
    try {
      const c = await save.mutateAsync({ data: { member_id: memberId, name: n.trim(), status: "active" } });
      onChange([...value, c.id]);
      if (fromSuggestion) onSuggestionsChange?.(suggestions.filter((s) => s !== n));
      setAdding(false);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add condition");
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...list].sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved"));

  return (
    <Field label={label} hint={value.length > 1 ? `${value.length} selected` : "Tap to select one or more"}>
      <div className="flex flex-col gap-3">
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2 rounded-sm border border-iris bg-iris-surface p-3">
            <div className="type-label text-ink-muted">Read from the prescription: add or skip each</div>
            {suggestions.map((s) => (
              <div key={s} className="flex items-center justify-between gap-2">
                <span className="min-w-0 type-body [overflow-wrap:anywhere]">{s}</span>
                <span className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" disabled={busy} onClick={() => create(s, true)}>
                    <Plus /> Add
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={`Skip ${s}`} onClick={() => onSuggestionsChange?.(suggestions.filter((x) => x !== s))}>
                    <X />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
          {sorted.map((c) => {
            const on = value.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.id)}
                className={cn(
                  "flex min-h-9 max-w-full items-center gap-1.5 rounded-sm border px-3 py-1 text-left type-label [overflow-wrap:anywhere]",
                  on ? "border-iris bg-iris-surface text-ink" : "border-rule bg-sheet text-ink-muted hover:bg-rule-soft",
                  c.status === "resolved" && !on && "text-ink-faint",
                )}
              >
                {on && <Check className="size-4 shrink-0 text-iris" />}
                {c.name}
                {c.status === "resolved" && <span className="text-ink-faint"> (resolved)</span>}
              </button>
            );
          })}
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-9 items-center gap-1 rounded-sm border border-dashed border-rule px-3 type-label text-iris hover:bg-rule-soft">
              <Plus className="size-4" /> New condition
            </button>
          )}
        </div>
        {adding && (
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eye infection" autoFocus aria-label="New condition" />
            <Button type="button" onClick={() => create(name)} disabled={busy}>
              Add
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Cancel" onClick={() => (setAdding(false), setName(""))}>
              <X />
            </Button>
          </div>
        )}
      </div>
    </Field>
  );
}
