import { describe, expect, it } from "vitest";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { KEEP, trimClient } from "./persist";

const q = (queryKey: unknown[], data: unknown, dataUpdatedAt = 1) =>
  ({ queryKey, queryHash: JSON.stringify(queryKey), state: { data, dataUpdatedAt, status: "success" } }) as unknown as PersistedClient["clientState"]["queries"][number];
const client = (queries: ReturnType<typeof q>[]): PersistedClient => ({ timestamp: 1, buster: "1", clientState: { queries, mutations: [] } });
const data = (c: PersistedClient, key: string) => c.clientState.queries.find((x) => x.queryKey[0] === key)?.state.data as unknown[] | undefined;

describe("trimClient: only the latest records stay on the phone", () => {
  it("keeps the newest few reports, visits and prescriptions", () => {
    const reports = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}` }));
    const out = trimClient(client([q(["reports", "m1", "all"], reports)]));
    expect(data(out, "reports")).toHaveLength(KEEP);
    expect(data(out, "reports")![0]).toEqual({ id: "r0" });
  });
  it("keeps every medicine in use and only the latest stopped ones", () => {
    const meds = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, status: "active", end_date: null })),
      ...Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, status: "stopped", end_date: `2026-0${(i % 9) + 1}-01` })),
    ];
    const kept = data(trimClient(client([q(["medications", "m1"], meds)])), "medications")!;
    expect(kept.filter((m) => (m as { status: string }).status === "active")).toHaveLength(4);
    expect(kept).toHaveLength(4 + KEEP);
  });
  it("keeps lab results from the newest reports only", () => {
    const labs = Array.from({ length: 15 }, (_, i) => ({ id: `v${i}`, report_date: `2026-${String(i + 1).padStart(2, "0")}-01`.replace(/-1[3-5]-/, "-12-") }));
    const kept = data(trimClient(client([q(["labs", "m1"], labs)])), "labs") as Array<{ report_date: string }>;
    expect(kept.every((v) => v.report_date >= "2026-03-01")).toBe(true);
  });
  it("keeps members whole, drops AI usage, and keeps only the most recently opened records", () => {
    const details = Array.from({ length: 90 }, (_, i) => q(["report", `r${i}`], { id: `r${i}` }, i));
    const out = trimClient(client([q(["members"], [{ id: 1 }, { id: 2 }]), q(["ai-usage"], { used: 1 }), ...details]));
    expect(data(out, "members")).toHaveLength(2);
    expect(out.clientState.queries.some((x) => x.queryKey[0] === "ai-usage")).toBe(false);
    const opened = out.clientState.queries.filter((x) => x.queryKey[0] === "report");
    expect(opened).toHaveLength(80);
    expect(opened.map((x) => x.queryKey[1])).not.toContain("r0");
  });
});
