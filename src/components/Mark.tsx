import { cn } from "@/lib/utils";

// Med Vault mark: a plus built from five Lekha-style tiles, centre tile in iris.
const TILES = [
  { x: 13, y: 1 },
  { x: 1, y: 13 },
  { x: 25, y: 13 },
  { x: 13, y: 25 },
];

export function Mark({ size = 32, variant = "solid", className }: { size?: number; variant?: "solid" | "loading" | "empty"; className?: string }) {
  const outline = variant === "empty";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden className={cn("shrink-0", className)}>
      {TILES.map((t) => (
        <rect
          key={`${t.x}-${t.y}`}
          x={t.x + (outline ? 0.75 : 0)}
          y={t.y + (outline ? 0.75 : 0)}
          width={outline ? 8.5 : 10}
          height={outline ? 8.5 : 10}
          rx={2.5}
          fill={outline ? "none" : variant === "loading" ? "var(--rule)" : "var(--ink)"}
          stroke={outline ? "var(--rule)" : undefined}
          strokeWidth={outline ? 1.5 : undefined}
        />
      ))}
      <rect
        x={13}
        y={13}
        width={10}
        height={10}
        rx={2.5}
        fill={outline ? "none" : "var(--iris)"}
        stroke={outline ? "var(--rule)" : undefined}
        strokeWidth={outline ? 1.5 : undefined}
        className={variant === "loading" ? "animate-pulse" : undefined}
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Mark size={28} />
      <span className="font-serif text-[22px] font-semibold tracking-[-0.025em]">Med Vault</span>
    </span>
  );
}
