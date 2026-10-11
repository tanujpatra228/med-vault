const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** '2026-10-11' -> '11 Oct 2026' */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

/** Local today as YYYY-MM-DD (not UTC, so evenings in India stay on the right day). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  const now = new Date(`${today()}T00:00:00`);
  const days = Math.round((now.getTime() - then.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 0) return `in ${-days} days`;
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

export function age(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00`);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ""))).toUpperCase();
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** Small counts read better as words inside a sentence. */
export const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
