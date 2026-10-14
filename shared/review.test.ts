import { describe, expect, it } from "vitest";
import { classesOf, mergeItems, ruleChecks, type ReviewItem } from "./review";

const rheum = "Dr Patel";
const psych = "Dr Iyer";

describe("classesOf", () => {
  it("recognises Indian brands and generics", () => {
    expect(classesOf({ name: "Meditrex 5 mg" })).toContain("methotrexate");
    expect(classesOf({ name: "Omnacortil 20" })).toContain("steroid");
    expect(classesOf({ name: "Nexito 10" })).toContain("ssri");
    expect(classesOf({ name: "Zerodol-SP" })).toContain("nsaid");
    expect(classesOf({ name: "Homin" })).toContain("folic");
    expect(classesOf({ name: "Xyz", generic: "pantoprazole" })).toContain("ppi");
    expect(classesOf({ name: "Dolo 650", notes: "Paracetamol" })).toEqual([]);
  });
});

describe("ruleChecks", () => {
  it("is quiet for Maa's real prescription (methotrexate with folic acid, steroid taper)", () => {
    const items = ruleChecks(
      [
        { name: "Meditrex", doctor: rheum },
        { name: "Homin", doctor: rheum },
        { name: "Omnacortil 20", doctor: rheum },
      ],
      [],
    );
    expect(items).toEqual([]);
  });

  it("flags an antidepressant from one doctor and a painkiller from another", () => {
    const [item] = ruleChecks(
      [
        { name: "Nexito 10", doctor: psych },
        { name: "Zerodol-P", doctor: rheum },
      ],
      [],
    );
    expect(item).toMatchObject({ level: "ask", medicines: ["Nexito 10", "Zerodol-P"], source: "rule" });
    expect(item.why).toContain("different doctors (Dr Iyer, Dr Patel)");
  });

  it("flags allergies by name and by class", () => {
    const items = ruleChecks([{ name: "Augmentin 625" }, { name: "Septran DS" }], ["Penicillin", "Sulfa drugs"]);
    expect(items.map((i) => [i.level, i.medicines.join()])).toEqual([
      ["talk_soon", "Augmentin 625"],
      ["talk_soon", "Septran DS"],
    ]);
  });

  it("flags two medicines of the same kind and risky combinations", () => {
    const items = ruleChecks([{ name: "Meditrex" }, { name: "Folvite" }, { name: "Brufen 400" }, { name: "Voveran 50" }, { name: "Septran" }], []);
    expect(items.map((i) => i.title)).toEqual([
      "Methotrexate with co-trimoxazole",
      "Two of the same kind: a painkiller (NSAID)",
      "Methotrexate with a painkiller",
    ]);
  });

  it("notes methotrexate without folic acid", () => {
    expect(ruleChecks([{ name: "Folitrax 15" }], []).map((i) => i.level)).toEqual(["note"]);
  });
});

describe("mergeItems", () => {
  it("drops AI items about the same combination as a rule item, keeps single-medicine ones", () => {
    const rule: ReviewItem = { level: "ask", title: "r", question: "", why: "", medicines: ["A", "B"], source: "rule" };
    const dup: ReviewItem = { ...rule, title: "ai dup", medicines: ["b", "a"], source: "ai" };
    const other: ReviewItem = { ...rule, level: "talk_soon", title: "ai new", medicines: ["C"], source: "ai" };
    const single: ReviewItem = { ...rule, level: "note", medicines: ["A"] };
    const aiSingle: ReviewItem = { ...single, title: "ai single", source: "ai" };
    expect(mergeItems([rule, single], [dup, other, aiSingle]).map((i) => i.title)).toEqual(["ai new", "r", "r", "ai single"]);
  });
});
