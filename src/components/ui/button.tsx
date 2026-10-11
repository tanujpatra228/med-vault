import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn Button, variants mapped to the design system: primary, secondary, danger, quiet.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm border type-label transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:border-rule disabled:bg-transparent disabled:text-ink-faint [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "border-iris bg-iris text-on-iris hover:border-iris-strong hover:bg-iris-strong",
        secondary: "border-rule bg-transparent text-ink hover:border-ink",
        outline: "border-rule bg-transparent text-ink hover:border-ink",
        destructive: "border-rust bg-transparent text-rust hover:border-ink hover:text-ink",
        ghost: "border-transparent bg-transparent text-ink hover:bg-rule-soft",
        link: "border-transparent bg-transparent px-1.5 text-iris hover:text-iris-strong hover:underline",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-10 px-3",
        lg: "h-12 px-6",
        icon: "size-12",
        "icon-sm": "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
