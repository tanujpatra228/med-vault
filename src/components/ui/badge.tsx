import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn Badge styled as the design system's Flag: dot + word, never colour alone.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-sm border px-2 type-caption font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-rule bg-sheet text-ink-muted [--dot:var(--ink-faint)]",
        warn: "border-rust bg-rust-surface text-rust [--dot:var(--rust)]",
        ok: "border-moss bg-moss-surface text-moss [--dot:var(--moss)]",
        focus: "border-iris bg-iris-surface text-iris [--dot:var(--iris)]",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  dot = true,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--dot)" />}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
