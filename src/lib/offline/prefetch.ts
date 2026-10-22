import { useEffect } from "react";
import { onlineManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queries } from "@/api/hooks";

type Opts = { queryKey: readonly unknown[]; queryFn?: unknown };

/** What each member tab reads, so the tab bar can load every tab before it is tapped. */
const TAB: Record<string, (memberId: string) => Opts[]> = {
  summary: (m) => [queries.summary(m)],
  medicines: (m) => [queries.medications(m)],
  prescriptions: (m) => [queries.prescriptions(m)],
  reports: (m) => [queries.reports(m)],
  trends: (m) => [queries.labs(m), queries.readings(m)],
  visits: (m) => [queries.visits(m)],
  health: (m) => [queries.allergies(m), queries.conditions(m)],
};

/** The queries the screen at a link reads; nothing for forms and pages it does not know. */
export function queriesFor(path: string): Opts[] {
  const tab = path.match(/^\/m\/([\w-]+)(?:\/(\w+))?$/);
  if (tab) return TAB[tab[2] ?? "summary"]?.(tab[1]) ?? [];
  const m = path.match(/^\/(medications|prescriptions|reports|visits|readings|allergies|conditions|doctors)\/([\w-]+)$/);
  if (!m || m[2] === "new") return [];
  const id = m[2];
  switch (m[1]) {
    case "medications":
      return [queries.medication(id), queries.medicationFiles(id)];
    case "prescriptions":
      return [queries.prescription(id)];
    case "reports":
      return [queries.report(id)];
    case "visits":
      return [queries.visit(id)];
    case "readings":
      return [queries.reading(id)];
    case "allergies":
      return [queries.allergy(id)];
    case "conditions":
      return [queries.conditionTimeline(id)];
    default:
      return [queries.doctor(id)];
  }
}

/** A few at a time, so a long list does not fire dozens of requests at once. */
const MAX_PARALLEL = 3;
const queue: Opts[] = [];
let running = 0;

function pump(qc: QueryClient) {
  while (running < MAX_PARALLEL && queue.length) {
    const opts = queue.shift()!;
    running++;
    // Skips anything already fresh in the cache (staleTime), so scrolling back and forth costs nothing.
    qc.prefetchQuery(opts as Parameters<QueryClient["prefetchQuery"]>[0]).finally(() => {
      running--;
      pump(qc);
    });
  }
}

/** Queues the screens at these paths, unless offline or the phone asks to save data. */
function prefetchPaths(qc: QueryClient, paths: string[]) {
  if (!onlineManager.isOnline() || saveData()) return;
  for (const path of paths) queue.push(...queriesFor(path));
  pump(qc);
}

/** A member's tabs are buttons, not links: opening the member loads every tab. */
export function usePrefetchTabs(memberId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (memberId) prefetchPaths(qc, Object.keys(TAB).map((t) => `/m/${memberId}/${t}`));
  }, [qc, memberId]);
}

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * Loads the record behind every link that comes on screen (a medicine in the list, a report, a tab),
 * so it opens instantly and is in the copy kept on the phone for offline use. Off when offline or
 * when the phone asks to save data.
 */
export function useLinkPrefetch() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const watched = new WeakMap<Element, string>();
    const io = new IntersectionObserver(
      (entries) => {
        if (!onlineManager.isOnline() || saveData()) return;
        const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLAnchorElement);
        visible.forEach((a) => io.unobserve(a));
        prefetchPaths(qc, visible.map((a) => a.pathname));
      },
      { rootMargin: "100px" },
    );
    let pending = 0;
    const scan = () => {
      pending = 0;
      document.querySelectorAll<HTMLAnchorElement>("a[href^='/']").forEach((a) => {
        // A link reused for another record (same element, new href) is watched again.
        if (watched.get(a) === a.pathname) return;
        watched.set(a, a.pathname);
        io.observe(a);
      });
    };
    const mo = new MutationObserver(() => {
      pending ||= requestAnimationFrame(scan);
    });
    scan();
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    // Coming back online: links already on screen are loaded too.
    const unsub = onlineManager.subscribe((online) => {
      if (!online) return;
      document.querySelectorAll("a[href^='/']").forEach((a) => {
        io.unobserve(a);
        io.observe(a);
      });
    });
    return () => {
      io.disconnect();
      mo.disconnect();
      unsub();
      cancelAnimationFrame(pending);
    };
  }, [qc]);
}
