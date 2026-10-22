import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { flushOutbox } from "@/lib/offline/outbox";
import { savedAt } from "@/lib/offline/persist";
import { KEEP } from "@/lib/offline/persist";
import { useOnline, usePendingReadings } from "@/lib/offline/useOnline";

const time = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * A thin bar at the bottom while offline (what is shown and how old it is), and the sender for
 * readings logged offline: it runs when the app opens and whenever the connection comes back.
 */
export function OfflineBanner() {
  const online = useOnline();
  const qc = useQueryClient();
  const pending = usePendingReadings().data ?? [];
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    if (!online) {
      savedAt().then(setSaved);
      return;
    }
    flushOutbox(qc).then((n) => n && toast.success(n === 1 ? "1 reading saved offline was sent" : `${n} readings saved offline were sent`));
  }, [online, qc]);

  if (online && !pending.length) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-sheet px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] type-caption text-ink-muted shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto flex max-w-[640px] items-start gap-2">
        {online ? <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin" /> : <CloudOff className="mt-0.5 size-4 shrink-0" />}
        <p>
          {online ? (
            <>Sending readings saved offline…</>
          ) : (
            <>
              <span className="font-semibold text-ink">Offline.</span> Showing the latest {KEEP} of each kind of record saved on this phone
              {saved ? `, last updated ${time.format(saved)}` : ""}. You can still log BP and sugar.
            </>
          )}
          {pending.length > 0 && !online && <span className="block">{pending.length === 1 ? "1 reading" : `${pending.length} readings`} waiting to send.</span>}
        </p>
      </div>
    </div>
  );
}
