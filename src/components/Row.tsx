import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { fileUrl } from "@/api/client";

/** Card that holds rows, separated by soft hairlines (LedgerRow list). */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-sm border border-rule bg-sheet px-4 [&>*+*]:border-t [&>*+*]:border-rule-soft", className)}>{children}</div>;
}

export function Tile({ label, photoId, className }: { label: string; photoId?: string | null; className?: string }) {
  if (photoId)
    return <img src={fileUrl(photoId)} alt="" className={cn("size-9 shrink-0 rounded-md object-cover", className)} loading="lazy" />;
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-iris-surface text-xs font-semibold tracking-wide text-ink-muted", className)}>
      {initials(label)}
    </span>
  );
}

interface RowProps {
  to?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  muted?: boolean;
  chevron?: boolean;
  /** Interactive control (e.g. call button) placed beside the row link, never inside it. */
  action?: ReactNode;
}

export function Row({ to, onClick, leading, title, subtitle, trailing, muted, action, chevron = !!to && !action }: RowProps) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate type-body font-semibold", muted && "text-ink-faint")}>{title}</span>
        {subtitle && <span className="mt-0.5 block type-label text-ink-faint">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      {chevron && <ChevronRight className="size-5 shrink-0 text-ink-faint" />}
    </>
  );
  const cls = "flex min-h-16 items-center gap-3.5 py-2.5 text-left";
  if (to && action)
    return (
      <div className="-mx-4 flex items-center gap-2 pr-4">
        <Link to={to} className={cn(cls, "min-w-0 flex-1 pl-4 hover:bg-rule-soft/50")}>
          {body}
        </Link>
        {action}
      </div>
    );
  if (to)
    return (
      <Link to={to} className={cn(cls, "-mx-4 px-4 hover:bg-rule-soft/50")}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, "-mx-4 w-[calc(100%+2rem)] px-4 hover:bg-rule-soft/50")}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
