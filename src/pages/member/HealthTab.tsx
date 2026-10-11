import { useAllergies, useConditions } from "@/api/hooks";
import { ErrorState, Loading, Section, SectionLink } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { ConditionFlag, SeverityFlag } from "@/components/flags";
import { capitalize, formatDate } from "@/lib/format";

export function HealthTab({ memberId }: { memberId: string }) {
  const allergies = useAllergies(memberId);
  const conditions = useConditions(memberId);
  return (
    <div>
      <Section title="Allergies" action={<SectionLink to={`/m/${memberId}/allergies/new`}>Add allergy</SectionLink>} className="border-t-0 pt-0">
        {allergies.isPending ? (
          <Loading />
        ) : allergies.isError ? (
          <ErrorState error={allergies.error} />
        ) : allergies.data.length ? (
          <RowList>
            {allergies.data.map((a) => (
              <Row
                key={a.id}
                to={`/allergies/${a.id}`}
                title={a.allergen}
                subtitle={[a.kind === "drug" ? "Medicine" : capitalize(a.kind), a.reaction].filter(Boolean).join(" · ")}
                trailing={<SeverityFlag severity={a.severity} />}
              />
            ))}
          </RowList>
        ) : (
          <p className="type-label text-ink-faint">No allergies recorded. If there are none known, nothing to do here.</p>
        )}
      </Section>
      <Section title="Health conditions" action={<SectionLink to={`/m/${memberId}/conditions/new`}>Add condition</SectionLink>}>
        {conditions.isPending ? (
          <Loading />
        ) : conditions.isError ? (
          <ErrorState error={conditions.error} />
        ) : conditions.data.length ? (
          <RowList>
            {conditions.data.map((c) => (
              <Row
                key={c.id}
                to={`/conditions/${c.id}`}
                muted={c.status === "resolved"}
                title={c.name}
                subtitle={c.diagnosed_on ? `Since ${formatDate(c.diagnosed_on)}` : undefined}
                trailing={<ConditionFlag status={c.status} />}
              />
            ))}
          </RowList>
        ) : (
          <p className="type-label text-ink-faint">No conditions recorded yet.</p>
        )}
      </Section>
    </div>
  );
}
