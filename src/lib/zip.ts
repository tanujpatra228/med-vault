/**
 * A minimal ZIP writer and reader for backups. Entries are stored, not compressed: photos and
 * PDFs are already compressed, so deflate would only cost phone CPU. No dependency needed.
 * The reader only understands stored entries, which is what the writer produces.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const UTF8_FLAG = 0x0800;
const encoder = new TextEncoder();

function dosDateTime(d: Date): [time: number, date: number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (Math.max(d.getFullYear() - 1980, 0) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
}

export class ZipWriter {
  private parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  private stamp: [number, number];

  constructor(date = new Date()) {
    this.stamp = dosDateTime(date);
  }

  add(path: string, content: Uint8Array | string) {
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const name = encoder.encode(path);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, UTF8_FLAG, true);
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, this.stamp[0], true);
    header.setUint16(12, this.stamp[1], true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true);
    this.parts.push(header.buffer, name as BlobPart, data as BlobPart);
    this.entries.push({ name, crc, size: data.length, offset: this.offset });
    this.offset += 30 + name.length + data.length;
  }

  finish(): Blob {
    const start = this.offset;
    let size = 0;
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true); // version made by
      h.setUint16(6, 20, true);
      h.setUint16(8, UTF8_FLAG, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, this.stamp[0], true);
      h.setUint16(14, this.stamp[1], true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.name.length, true);
      h.setUint32(42, e.offset, true);
      this.parts.push(h.buffer, e.name as BlobPart);
      size += 46 + e.name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, start, true);
    this.parts.push(end.buffer);
    return new Blob(this.parts, { type: "application/zip" });
  }
}

/** Reads every stored entry of a ZIP into memory, keyed by path. */
export function readZip(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not a ZIP file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("The ZIP file is damaged");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (method !== 0) throw new Error("This ZIP was changed after export. Use the original Med Vault backup file.");
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.set(name, new Uint8Array(buffer, dataStart, size));
  }
  return out;
}
