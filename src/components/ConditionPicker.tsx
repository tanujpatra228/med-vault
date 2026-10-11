import { useState } from "react";
import { toast } from "sonner";
import type { Condition } from "@shared/types";
import { useConditions, useSave } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Field } from "@/components/Field";

const NEW = "__new__";

export function ConditionPicker({ memberId, value, onChange, label = "For which condition" }: { memberId: string; value: string; onChange: (id: string) => void; label?: string }) {
  const conditions = useConditions(memberId);
  const save = useSave<Condition>("conditions");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim()) return toast.error("Condition name is required");
    try {
      const c = await save.mutateAsync({ data: { member_id: memberId, name, status: "active" } });
      onChange(c.id);
      setAdding(false);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add condition");
    }
  };

  if (adding)
    return (
      <div className="flex flex-col gap-3 rounded-sm border border-rule bg-paper p-3">
        <Field label="New condition">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Eye infection" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={save.isPending}>
            Add condition
          </Button>
        </div>
      </div>
    );

  return (
    <Field label={label}>
      <NativeSelect value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}>
        <NativeSelectOption value="">Not linked</NativeSelectOption>
        {conditions.data?.map((c) => (
          <NativeSelectOption key={c.id} value={c.id}>
            {c.name}
            {c.status === "resolved" ? " (resolved)" : ""}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NEW}>+ Add a new condition</NativeSelectOption>
      </NativeSelect>
    </Field>
  );
}
