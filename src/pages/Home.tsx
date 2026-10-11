import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Stethoscope, UserPlus } from "lucide-react";
import { api } from "@/api/client";
import { useMembers } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Loading, Page } from "@/components/layout";
import { Row, RowList, Tile } from "@/components/Row";
import { Wordmark } from "@/components/Mark";
import { age, countWord, plural } from "@/lib/format";

export function Home() {
  const members = useMembers();
  const qc = useQueryClient();
  const logout = async () => {
    await api.post("/auth/logout");
    qc.clear();
    qc.invalidateQueries({ queryKey: ["auth"] });
  };

  const list = members.data ?? [];
  const totalMeds = list.reduce((n, m) => n + m.active_med_count, 0);

  return (
    <>
      <header className="mx-auto flex h-16 max-w-[640px] items-center justify-between px-5">
        <Wordmark />
        <div className="flex items-center">
          <Button asChild variant="ghost" size="icon" aria-label="Doctors">
            <Link to="/doctors">
              <Stethoscope />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
            <LogOut />
          </Button>
        </div>
      </header>
      <Page>
        <h1 className="mt-6 display-lg">Family</h1>
        {list.length > 0 && (
          <p className="mt-3 mb-8 statement-md text-ink-muted">
            {capitalizeFirst(countWord(list.length))} {list.length === 1 ? "person" : "people"},{" "}
            <span className="num text-[0.82em] text-ink">{totalMeds}</span> {totalMeds === 1 ? "medicine" : "medicines"} being taken.
          </p>
        )}
        {members.isPending ? (
          <Loading />
        ) : members.isError ? (
          <ErrorState error={members.error} retry={() => members.refetch()} />
        ) : list.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Add your first family member"
              body="Start with the person whose medicines are hardest to keep track of."
              action={
                <Button asChild>
                  <Link to="/members/new">Add a family member</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <RowList>
              {list.map((m) => {
                const years = age(m.dob);
                return (
                  <Row
                    key={m.id}
                    to={`/m/${m.id}`}
                    leading={<Tile label={m.name} photoId={m.photo_file_id} className="size-11" />}
                    title={m.name}
                    subtitle={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {[m.relation, years !== null ? `${years} yrs` : null, m.blood_group].filter(Boolean).join(" · ") || "Tap to open"}
                        {m.allergy_count > 0 && <Badge variant="warn">{plural(m.allergy_count, "allergy", "allergies")}</Badge>}
                      </span>
                    }
                    trailing={
                      <span className="block">
                        <span className="block num text-[15px] font-medium">{m.active_med_count}</span>
                        <span className="block type-caption text-ink-faint">{m.active_med_count === 1 ? "medicine" : "medicines"}</span>
                      </span>
                    }
                  />
                );
              })}
            </RowList>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <Link to="/members/new">
                <UserPlus /> Add a family member
              </Link>
            </Button>
          </>
        )}
      </Page>
    </>
  );
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
