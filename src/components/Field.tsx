import { useId, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";
import { Label } from "@/components/ui/label";

/** Label above, control, helper below. Wires id/aria automatically. */
export function Field({ label, hint, children, required }: { label: ReactNode; hint?: ReactNode; required?: boolean; children: ReactElement<{ id?: string; "aria-describedby"?: string }> }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-ink-faint">(required)</span>}
      </Label>
      {cloneElement(children, { id, "aria-describedby": hintId })}
      {hint && (
        <p id={hintId} className="type-caption text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>;
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
