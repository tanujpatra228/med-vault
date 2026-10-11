import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-sm border border-input bg-sheet px-3 py-3 type-body text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:border-iris focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rust",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
