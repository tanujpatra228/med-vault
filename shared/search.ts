// Search across a vault. See docs/SEARCH.md.

export type SearchType = "member" | "medication" | "prescription" | "report" | "lab" | "condition" | "allergy" | "visit" | "doctor";

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  member_id: string | null;
  member_name: string | null;
  /** The record's own date (prescribed, report, visit, start), for sorting and display. */
  date: string | null;
  /** Where tapping the hit goes. */
  href: string;
}

export const MAX_TERMS = 6;
export const MIN_QUERY = 2;

/** Words to match (all of them, anywhere in the record). Empty when the query is too short. */
export function searchTerms(q: string): string[] {
  const clean = q.normalize("NFC").trim().replace(/\s+/g, " ");
  if (clean.length < MIN_QUERY) return [];
  return [...new Set(clean.toLowerCase().split(" ").filter(Boolean))].slice(0, MAX_TERMS);
}

/** A LIKE pattern matching the word anywhere, with %, _ and \ taken literally (ESCAPE '\'). */
export const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
