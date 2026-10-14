import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, FileText, FlaskConical, HeartPulse, Pill, Search as SearchIcon, ShieldAlert, Stethoscope, TestTube, User, X } from "lucide-react";
import { searchTerms, type SearchHit, type SearchType } from "@shared/search";
import { api } from "@/api/client";
import { useMember } from "@/api/hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, Eyebrow, Loading, Page, TopBar } from "@/components/layout";
import { formatDate } from "@/lib/format";

const GROUPS: Array<{ type: SearchType; label: string; icon: typeof Pill }> = [
  { type: "member", label: "Family", icon: User },
  { type: "medication", label: "Medicines", icon: Pill },
  { type: "prescription", label: "Prescriptions", icon: FileText },
  { type: "report", label: "Reports", icon: FlaskConical },
  { type: "lab", label: "Lab results", icon: TestTube },
  { type: "condition", label: "Health conditions", icon: HeartPulse },
  { type: "allergy", label: "Allergies", icon: ShieldAlert },
  { type: "visit", label: "Visits", icon: CalendarCheck },
  { type: "doctor", label: "Doctors", icon: Stethoscope },
];

const RECENT_KEY = "mv:recent-searches";
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const saveRecent = (q: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 6)));
  } catch {
    // private mode: no history
  }
};

/** Wraps the matched words in <mark>, case-insensitively. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts: ReactNode[] = text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-[2px] bg-iris-surface px-px text-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  );
  return <>{parts}</>;
}

/** Search everything in the vault, or one person's records (?member=). Every word must match. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get("member") ?? undefined;
  const member = useMember(memberId);
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);

  // Search 250 ms after typing stops; keep the query in the URL so Back returns to the results.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text);
      const next = new URLSearchParams(params);
      if (text.trim()) next.set("q", text.trim());
      else next.delete("q");
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const terms = useMemo(() => searchTerms(q), [q]);
  const results = useQuery({
    queryKey: ["search", q.trim(), memberId ?? ""],
    queryFn: () => api.get<{ hits: SearchHit[] }>(`/search?${new URLSearchParams({ q: q.trim(), ...(memberId ? { member_id: memberId } : {}) })}`),
    enabled: terms.length > 0,
    placeholderData: (prev) => prev,
  });
  const hits = terms.length ? (results.data?.hits ?? []) : [];

  const remember = () => {
    if (q.trim().length >= 2) {
      saveRecent(q.trim());
      setRecent(readRecent());
    }
  };

  return (
    <>
      <TopBar back={memberId ? `/m/${memberId}` : "/"} title={memberId ? (member.data?.name ?? "Search") : "Family"} />
      <Page className="pb-12">
        <div className="sticky top-14 z-10 -mx-5 bg-paper px-5 pt-4 pb-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-faint" />
            <Input
              ref={input}
              type="search"
              enterKeyHint="search"
              autoFocus
              aria-label="Search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Medicine, doctor, test, condition, notes…"
              className="pr-10 pl-10"
            />
            {text && (
              <button type="button" aria-label="Clear" onClick={() => (setText(""), input.current?.focus())} className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-ink-faint">
                <X className="size-5" />
              </button>
            )}
          </div>
          {memberId && (
            <div className="mt-2 flex items-center gap-2 type-label text-ink-muted">
              Only {member.data?.name ?? "this person"}'s records
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setParams(new URLSearchParams(q.trim() ? { q: q.trim() } : {}), { replace: true })}>
                Search everyone
              </Button>
            </div>
          )}
        </div>

        {!terms.length ? (
          recent.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <Eyebrow>Recent</Eyebrow>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-ink-faint"
                  onClick={() => {
                    try {
                      localStorage.removeItem(RECENT_KEY);
                    } catch {
                      // ignore
                    }
                    setRecent([]);
                  }}
                >
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => setText(r)} className="h-9 rounded-sm border border-rule bg-sheet px-3 type-label text-ink-muted hover:bg-rule-soft">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 type-label text-ink-faint">Search medicines, doctors, reports and test names (ESR, HbA1c), conditions, allergies, visits and anything in your notes.</p>
          )
        ) : results.isPending ? (
          <Loading label="Searching" />
        ) : !hits.length ? (
          <div className="mt-6">
            <EmptyState title={`Nothing found for "${q.trim()}"`} body="Try fewer words, or part of a name (e.g. “metfor”)." />
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-6" onClickCapture={remember}>
            <p className="type-caption text-ink-faint" role="status">
              {hits.length} {hits.length === 1 ? "match" : "matches"}
            </p>
            {GROUPS.map(({ type, label, icon: Icon }) => {
              const group = hits.filter((h) => h.type === type);
              if (!group.length) return null;
              return (
                <section key={type}>
                  <Eyebrow className="mb-2">
                    {label} · {group.length}
                    {group.length === 8 ? "+" : ""}
                  </Eyebrow>
                  <div className="rounded-sm border border-rule bg-sheet px-4">
                    {group.map((h, i) => (
                      <Link key={h.id} to={h.href} className={`-mx-4 flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-rule-soft/50 ${i ? "border-t border-rule-soft" : ""}`}>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-iris-surface text-ink-muted">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate type-body font-semibold">
                            <Highlight text={h.title} terms={terms} />
                          </span>
                          {(h.subtitle || (!memberId && h.member_name && type !== "member")) && (
                            <span className="block truncate type-label text-ink-faint">
                              <Highlight text={[!memberId && type !== "member" ? h.member_name : null, h.subtitle].filter(Boolean).join(" · ")} terms={terms} />
                            </span>
                          )}
                        </span>
                        {h.date && <span className="shrink-0 num text-[12px] text-ink-faint">{formatDate(h.date)}</span>}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
