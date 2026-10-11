import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-12 w-full min-w-0 rounded-sm border border-input bg-sheet px-3 type-body text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:border-iris focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rust file:border-0 file:bg-transparent file:type-label",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
