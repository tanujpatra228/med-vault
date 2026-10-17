import { Plus, X } from "lucide-react";
import type { LabDraft } from "@shared/types";
import { flagOf, parseValue, rangeFor } from "@shared/labs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/layout";

export const emptyLab = (): LabDraft => ({ test_name: "", value_text: "", unit: "", ref_text: "" });

/** Live high/low badge for a row being typed (the server works out the same flag on save). */
export function FlagBadge({ flag }: { flag: "high" | "low" | null }) {
  if (!flag) return null;
  return <Badge variant="warn">{flag === "high" ? "High" : "Low"}</Badge>;
}

/** The results printed on a report, one row per test. Filled by a scan; every cell editable. */
export function LabValuesEditor({ value, onChange }: { value: LabDraft[]; onChange: (rows: LabDraft[]) => void }) {
  const set = (i: number, patch: Partial<LabDraft>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="border-t border-rule pt-5">
      <Eyebrow className="mb-1">Results · {value.filter((r) => r.test_name.trim() && r.value_text?.trim()).length}</Eyebrow>
      <p className="mb-4 type-caption text-ink-faint">Each result builds that test's trend chart. Copy numbers exactly as printed.</p>
      <div className="flex flex-col gap-3">
        {value.map((r, i) => {
          const { low, high } = rangeFor(r.ref_text, r.value_text, r.unit);
          const flag = flagOf(parseValue(r.value_text), low, high);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-sm border border-rule bg-sheet p-3">
              <div className="flex items-center gap-2">
                <Input aria-label={`Test ${i + 1}`} placeholder="Test, e.g. ESR" value={r.test_name} onChange={(e) => set(i, { test_name: e.target.value })} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove result ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2">
                <Input aria-label="Result" placeholder="Result" inputMode="decimal" value={r.value_text ?? ""} onChange={(e) => set(i, { value_text: e.target.value })} />
                <Input aria-label="Unit" placeholder="Unit" value={r.unit ?? ""} onChange={(e) => set(i, { unit: e.target.value })} />
                <Input aria-label="Normal range" placeholder="Normal, e.g. 0-20" value={r.ref_text ?? ""} onChange={(e) => set(i, { ref_text: e.target.value })} />
              </div>
              <FlagBadge flag={flag} />
            </div>
          );
        })}
        <Button type="button" variant="secondary" onClick={() => onChange([...value, emptyLab()])}>
          <Plus /> Add a result
        </Button>
      </div>
    </div>
  );
}
