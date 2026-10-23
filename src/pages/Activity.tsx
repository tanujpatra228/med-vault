import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MapPin, ShieldAlert } from "lucide-react";
import { AUDIT_DAYS, describeAudit, type AuditEntry } from "@shared/audit";
import { api } from "@/api/client";
import { authApi, useVault } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { EmptyState, ErrorState, Eyebrow, Loading, Page, TopBar } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { formatDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });
const region = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (code: string) => {
  try {
    return region?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Screens that still show a record, for entries that added or edited one. */
const RECORD_PATHS: Record<string, string> = {
  member: "/m/",
  medication: "/medications/",
  prescription: "/prescriptions/",
  report: "/reports/",
  lab_results: "/reports/",
  visit: "/visits/",
  reading: "/readings/",
  allergy: "/allergies/",
  condition: "/conditions/",
  doctor: "/doctors/",
};

const linkFor = (e: AuditEntry) =>
  (e.action === "record.create" || e.action === "record.update") && e.record_id && RECORD_PATHS[e.record_type ?? ""] ? RECORD_PATHS[e.record_type!] + e.record_id : undefined;

const dayOf = (iso: string) => new Date(iso).toDateString();

/**
 * The vault's security log: every change, which phone made it, from where, for the last year.
 * Filter by phone to see what a lost phone did, and remove it from here.
 */
export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const deviceId = params.get("device") ?? "";
  const vault = useVault();
  const q = useInfiniteQuery({
    queryKey: ["activity", deviceId],
    queryFn: ({ pageParam }) =>
      api.get<{ entries: AuditEntry[]; more: boolean }>(`/vault/activity?${new URLSearchParams({ ...(deviceId && { device_id: deviceId }), ...(pageParam && { before: String(pageParam) }) })}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.more ? last.entries[last.entries.length - 1]?.id : undefined),
  });
  const entries = useMemo(() => q.data?.pages.flatMap((p) => p.entries) ?? [], [q.data]);
  const days = useMemo(() => {
    const byDay = new Map<string, AuditEntry[]>();
    for (const e of entries) (byDay.get(dayOf(e.at)) ?? byDay.set(dayOf(e.at), []).get(dayOf(e.at))!).push(e);
    return [...byDay];
  }, [entries]);

  // The country most changes come from; anything else is marked, so a stranger's use stands out.
  const home = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) if (e.country) counts.set(e.country, (counts.get(e.country) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [entries]);

  const devices = vault.data?.devices ?? [];
  const device = devices.find((d) => d.id === deviceId);
  const removedName = !device && deviceId ? entries.find((e) => e.device_id === deviceId)?.device_name : null;

  return (
    <>
      <TopBar back="/settings" title="Settings" />
      <Page>
        <h1 className="mt-6 mb-2 display-lg">Activity</h1>
        <p className="mb-6 type-body text-ink-muted">
          Every change in this vault, which phone made it and from which country, for the last {AUDIT_DAYS === 365 ? "year" : `${AUDIT_DAYS} days`}. Opening a record is not listed. Medical details are never
          kept here.
        </p>

        <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Show activity for">
          {[{ id: "", name: "All phones" }, ...devices].map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={deviceId === d.id}
              onClick={() => setParams(d.id ? { device: d.id } : {}, { replace: true })}
              className={cn(
                "h-10 shrink-0 rounded-full border px-4 type-label",
                deviceId === d.id ? "border-iris bg-iris-surface text-ink" : "border-rule bg-sheet text-ink-muted",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>

        {device && !device.current && (
          <div className="mb-6 rounded-sm border border-rule bg-sheet p-4">
            <p className="flex items-center gap-2 type-body font-semibold">
              <ShieldAlert className="size-5 text-rust" /> Lost this phone, or don't recognise it?
            </p>
            <p className="mt-1 type-label text-ink-muted">Remove it and it loses access straight away. Last used {relativeDays(device.last_seen_at)}.</p>
            <ConfirmDelete
              what={`"${device.name}"`}
              detail="That phone will lose access to this vault. If it was stolen, also make a new recovery key in Settings."
              onConfirm={async () => {
                await authApi.removeDevice(device.id);
                await vault.refetch();
                setParams({}, { replace: true });
              }}
              trigger={
                <Button variant="secondary" className="mt-3 w-full text-rust">
                  Remove "{device.name}"
                </Button>
              }
            />
          </div>
        )}
        {removedName && <p className="mb-4 type-label text-ink-muted">"{removedName}" is no longer linked to this vault.</p>}

        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState title="Nothing yet" body="Changes made from now on are listed here." />
        ) : (
          <>
            {days.map(([day, list]) => (
              <section key={day} className="mb-6">
                <Eyebrow className="mb-2 block">{relativeDays(list[0].at) === "today" ? "Today" : formatDate(list[0].at)}</Eyebrow>
                <RowList>
                  {list.map((e) => (
                    <Row
                      key={e.id}
                      to={linkFor(e)}
                      title={
                        <span className="whitespace-normal">
                          {e.device_name ?? "A phone"} {describeAudit(e)}
                          {e.member_name ? (e.record_type === "member" ? `: ${e.member_name}` : ` for ${e.member_name}`) : ""}
                        </span>
                      }
                      subtitle={[time.format(new Date(e.at)), e.client, e.country && countryName(e.country), !e.linked && e.device_id && "phone since removed"].filter(Boolean).join(" · ")}
                      trailing={
                        home && e.country && e.country !== home ? (
                          <Badge variant="warn" className="gap-1">
                            <MapPin className="size-3" /> Unusual place
                          </Badge>
                        ) : undefined
                      }
                    />
                  ))}
                </RowList>
              </section>
            ))}
            {q.hasNextPage && (
              <Button variant="secondary" className="mt-6 w-full" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {q.isFetchingNextPage ? "Loading…" : "Show older"}
              </Button>
            )}
          </>
        )}
      </Page>
    </>
  );
}
