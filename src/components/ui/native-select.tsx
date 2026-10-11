import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn NativeSelect: a styled <select>, so Android shows its own picker.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(
          "h-12 w-full appearance-none rounded-sm border border-input bg-sheet pr-10 pl-3 type-body text-ink outline-none transition-colors focus-visible:border-iris focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rust",
          className,
        )}
        {...props}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-faint" strokeWidth={1.75} />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
