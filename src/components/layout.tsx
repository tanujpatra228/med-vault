import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/Mark";
import { cn } from "@/lib/utils";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-[640px] px-5 pb-28", className)}>{children}</main>;
}

/** Top bar with a back button. `back` is a path; defaults to history back. */
export function TopBar({ title, back, action }: { title?: ReactNode; back?: string; action?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[640px] items-center gap-1 px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => (back ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate("/"))}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1 truncate type-label text-ink-muted">{title}</div>
        {action}
      </div>
    </header>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("meta text-ink-faint", className)}>{children}</div>;
}

/** A section: eyebrow + optional action link, then content. Sections are separated by a rule. */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-rule pt-5 pb-8", className)}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="type-label text-iris hover:text-iris-strong hover:underline">
      {children}
    </Link>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-faint" role="status">
      <Mark size={40} variant="loading" />
      <span className="type-caption">{label}</span>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-rule bg-sheet px-5 py-8 text-center">
      <Mark size={40} variant="empty" />
      <div className="type-body font-semibold">{title}</div>
      {body && <p className="max-w-xs type-label text-ink-faint">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-rust bg-rust-surface px-5 py-6 text-center text-rust">
      <div className="type-body font-semibold">Could not load this</div>
      <p className="type-label">{error instanceof Error ? error.message : "Something went wrong"}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
