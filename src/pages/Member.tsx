import { Link, useNavigate, useParams } from "react-router";
import { Pencil } from "lucide-react";
import { useMember } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddSheet } from "@/components/AddSheet";
import { ErrorState, Loading, Page, TopBar } from "@/components/layout";
import { Tile } from "@/components/Row";
import { age, capitalize } from "@/lib/format";
import { SummaryTab } from "./member/SummaryTab";
import { MedicinesTab } from "./member/MedicinesTab";
import { PrescriptionsTab } from "./member/PrescriptionsTab";
import { ReportsTab } from "./member/ReportsTab";
import { HealthTab } from "./member/HealthTab";

const TABS = [
  { key: "summary", label: "Summary" },
  { key: "medicines", label: "Medicines" },
  { key: "prescriptions", label: "Prescriptions" },
  { key: "reports", label: "Reports" },
  { key: "health", label: "Allergies & conditions" },
] as const;

export function MemberPage() {
  const { memberId = "", tab = "summary" } = useParams();
  const navigate = useNavigate();
  const member = useMember(memberId);

  if (member.isPending)
    return (
      <>
        <TopBar back="/" />
        <Loading />
      </>
    );
  if (member.isError)
    return (
      <>
        <TopBar back="/" />
        <Page className="pt-6">
          <ErrorState error={member.error} retry={() => member.refetch()} />
        </Page>
      </>
    );

  const m = member.data;
  const years = age(m.dob);
  const facts = [m.relation, years !== null ? `${years} yrs` : null, m.sex ? capitalize(m.sex) : null, m.blood_group ? `Blood ${m.blood_group}` : null].filter(Boolean);

  return (
    <>
      <TopBar
        back="/"
        title="Family"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="Edit profile">
            <Link to={`/m/${m.id}/edit`}>
              <Pencil />
            </Link>
          </Button>
        }
      />
      <Page>
        <div className="mt-6 flex items-center gap-4">
          <Tile label={m.name} photoId={m.photo_file_id} className="size-16 rounded-md text-base" />
          <div className="min-w-0">
            <h1 className="truncate display-lg">{m.name}</h1>
            {facts.length > 0 && <div className="mt-1 type-label text-ink-faint">{facts.join(" · ")}</div>}
          </div>
        </div>
        <Tabs value={tab} onValueChange={(t) => navigate(`/m/${m.id}${t === "summary" ? "" : `/${t}`}`, { replace: true })} className="mt-6">
          <TabsList className="sticky top-14 z-20 -mx-5 w-[calc(100%+2.5rem)] bg-paper px-5">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary" className="pt-6">
            <SummaryTab memberId={m.id} />
          </TabsContent>
          <TabsContent value="medicines" className="pt-6">
            <MedicinesTab memberId={m.id} />
          </TabsContent>
          <TabsContent value="prescriptions" className="pt-6">
            <PrescriptionsTab memberId={m.id} />
          </TabsContent>
          <TabsContent value="reports" className="pt-6">
            <ReportsTab memberId={m.id} />
          </TabsContent>
          <TabsContent value="health" className="pt-6">
            <HealthTab memberId={m.id} />
          </TabsContent>
        </Tabs>
      </Page>
      <AddSheet memberId={m.id} memberName={m.name.split(" ")[0]} />
    </>
  );
}
