import { describe, expect, it } from "vitest";
import { crc32, readZip, ZipWriter } from "./zip";

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("round-trips text, binary and non-ASCII names", async () => {
    const zip = new ZipWriter(new Date(2026, 9, 14, 10, 30));
    const bytes = new Uint8Array([0, 255, 1, 254, 137, 80, 78, 71]);
    zip.add("data.json", '{"a":1}');
    zip.add("files/मम्मी/photo.jpg", bytes);
    const blob = zip.finish();
    const entries = readZip(await blob.arrayBuffer());
    expect([...entries.keys()]).toEqual(["data.json", "files/मम्मी/photo.jpg"]);
    expect(new TextDecoder().decode(entries.get("data.json"))).toBe('{"a":1}');
    expect([...entries.get("files/मम्मी/photo.jpg")!]).toEqual([...bytes]);
  });

  it("rejects files that are not ZIPs", () => {
    expect(() => readZip(new TextEncoder().encode("hello, this is not a zip file at all").buffer)).toThrow(/not a ZIP/);
  });
});
