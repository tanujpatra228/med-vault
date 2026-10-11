import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Page, TopBar } from "@/components/layout";

/** Full-screen form: title, fields, one primary save action pinned to the bottom. */
export function FormPage({
  title,
  heading,
  onSubmit,
  submitLabel = "Save",
  children,
  footer,
}: {
  title: string;
  heading: string;
  onSubmit: () => Promise<void>;
  submitLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <TopBar title={title} />
      <Page>
        <h1 className="mt-6 mb-8 display-lg">{heading}</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            try {
              await onSubmit();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-5"
        >
          {children}
          <div className="sticky bottom-0 -mx-5 mt-4 border-t border-rule bg-paper px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving" : submitLabel}
            </Button>
          </div>
        </form>
        {footer && <div className="mt-8 border-t border-rule pt-6">{footer}</div>}
      </Page>
    </>
  );
}
