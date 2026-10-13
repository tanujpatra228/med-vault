import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import type { Condition } from "@shared/types";
import { useConditions, useSave } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { sameName } from "@/lib/format";

/** Extra diagnoses read from a prescription: one tap adds each to the member's health conditions. */
export function OtherDiagnoses({ memberId, names }: { memberId: string; names: string[] }) {
  const existing = useConditions(memberId);
  const save = useSave<Condition>("conditions");
  const [busy, setBusy] = useState(false);
  const known = existing.data ?? [];
  const missing = names.filter((n) => !known.some((c) => sameName(c.name, n)));
  const present = names.filter((n) => !missing.includes(n));
  if (!names.length || existing.isPending) return null;

  const add = async (list: string[]) => {
    setBusy(true);
    try {
      for (const name of list) await save.mutateAsync({ data: { member_id: memberId, name, status: "active" } });
      toast.success(list.length === 1 ? `${list[0]} added` : `${list.length} conditions added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-rule bg-sheet p-3">
      <div className="type-label text-ink-muted">Other diagnoses on this prescription</div>
      {missing.map((n) => (
        <div key={n} className="flex items-center justify-between gap-3">
          <span className="min-w-0 type-body [overflow-wrap:anywhere]">{n}</span>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => add([n])}>
            <Plus /> Add
          </Button>
        </div>
      ))}
      {present.map((n) => (
        <div key={n} className="flex items-center gap-2 type-label text-ink-faint">
          <Check className="size-4" /> {n} is already in health conditions
        </div>
      ))}
      {missing.length > 1 && (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => add(missing)}>
          Add all {missing.length}
        </Button>
      )}
    </div>
  );
}
