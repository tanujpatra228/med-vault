import { BACKUP_FORMAT, RESTORE_CHUNK, RESTORE_ORDER, type BackupData, type BackupFile, type RestoreIdMap, type RestoreTable } from "@shared/backup";
import type { FileOwner } from "@shared/types";
import { api, fileUrl } from "@/api/client";
import { backupHtml } from "./backupHtml";
import { readZip, ZipWriter } from "./zip";

export type Progress = (text: string) => void;

const DATA_FILE = "data.json";
const OWNER_TABLE: Record<FileOwner, RestoreTable> = {
  member: "members",
  prescription: "prescriptions",
  report: "reports",
  medication: "medications",
};
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

const safe = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled";

/**
 * Readable, unique paths for every file: files/<member>/<date> <what it belongs to> <n>.<ext>,
 * e.g. "files/Mom/2026-10-10 Prescription Dr Rao 1.jpg".
 */
export function assignPaths(d: BackupData): BackupFile[] {
  const used = new Set<string>();
  const member = (id: string | null) => d.members.find((m) => m.id === id)?.name ?? "Family";
  const doctor = (id: string | null) => d.doctors.find((x) => x.id === id)?.name;
  const label = (f: BackupFile): string => {
    switch (f.owner_type) {
      case "prescription": {
        const p = d.prescriptions.find((x) => x.id === f.owner_id);
        return p ? `${p.prescribed_on} Prescription${doctor(p.doctor_id) ? ` ${doctor(p.doctor_id)}` : ""}` : "Prescription";
      }
      case "report": {
        const r = d.reports.find((x) => x.id === f.owner_id);
        return r ? `${r.report_date} ${r.title}` : "Report";
      }
      case "medication":
        return `Medicine ${d.medications.find((x) => x.id === f.owner_id)?.name ?? ""}`;
      default:
        return "Photo";
    }
  };
  return d.files.map((f) => {
    const ext = EXT[f.mime_type] ?? f.name?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "bin";
    const base = `files/${safe(member(f.member_id))}/${safe(label(f))}`;
    let n = 1;
    while (used.has(`${base} ${n}.${ext}`.toLowerCase())) n++;
    const path = `${base} ${n}.${ext}`;
    used.add(path.toLowerCase());
    return { ...f, path };
  });
}

/** Every record and file in the vault as one ZIP: data.json, "Open me.html" and a files folder. */
export async function buildBackup(onProgress: Progress): Promise<{ blob: Blob; filename: string; data: BackupData }> {
  onProgress("Collecting records…");
  const raw = await api.get<BackupData>("/vault/export");
  const data: BackupData = { ...raw, files: assignPaths(raw) };
  const zip = new ZipWriter();
  let done = 0;
  for (const f of data.files) {
    onProgress(`Adding photos and files · ${++done} of ${data.files.length}`);
    const res = await fetch(fileUrl(f.id), { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Could not download "${f.name ?? f.path}" (${res.status})`);
    zip.add(f.path!, new Uint8Array(await res.arrayBuffer()));
  }
  zip.add("Open me.html", backupHtml(data));
  zip.add(DATA_FILE, JSON.stringify(data, null, 1));
  onProgress("Packing…");
  const filename = `Med Vault backup ${safe(data.vault.name)} ${data.exported_at.slice(0, 10)}.zip`;
  return { blob: zip.finish(), filename, data };
}

/** Reads a backup ZIP and checks it is one of ours, before anything is sent. */
export async function readBackup(file: File): Promise<{ data: BackupData; entries: Map<string, Uint8Array> }> {
  const entries = readZip(await file.arrayBuffer());
  const json = entries.get(DATA_FILE);
  if (!json) throw new Error("This ZIP is not a Med Vault backup (data.json is missing)");
  const data = JSON.parse(new TextDecoder().decode(json)) as BackupData;
  if (data.format !== BACKUP_FORMAT) throw new Error("This ZIP is not a Med Vault backup");
  return { data, entries };
}

/**
 * Restores records table by table in small chunks (see RESTORE_CHUNK), then uploads each file to its
 * new owner. If a record chunk fails, everything restored so far is deleted again, so the vault is
 * either restored or left empty.
 */
export async function restoreBackup(
  { data, entries }: Awaited<ReturnType<typeof readBackup>>,
  onProgress: Progress,
): Promise<{ records: number; files: number; failed: string[] }> {
  const ids = Object.fromEntries(RESTORE_ORDER.map((t) => [t, {}])) as RestoreIdMap;
  const total = RESTORE_ORDER.reduce((n, t) => n + (data[t]?.length ?? 0), 0);
  if (!total) throw new Error("This backup has no records");
  let records = 0;
  try {
    for (const table of RESTORE_ORDER) {
      const rows = data[table] ?? [];
      for (let i = 0; i < rows.length; i += RESTORE_CHUNK) {
        onProgress(`Restoring records · ${records} of ${total}`);
        const { members, doctors, conditions, prescriptions } = ids;
        const res = await api.post<{ ids: Record<string, string> }>("/vault/restore", {
          version: data.version,
          table,
          start: records === 0,
          rows: rows.slice(i, i + RESTORE_CHUNK),
          refs: { members, doctors, conditions, prescriptions },
        });
        Object.assign(ids[table], res.ids);
        records += Math.min(RESTORE_CHUNK, rows.length - i);
      }
    }
  } catch (e) {
    if (records > 0) {
      onProgress("Restore failed. Removing what was added…");
      for (const id of Object.values(ids.members)) await api.del(`/members/${id}`).catch(() => {});
      for (const id of Object.values(ids.doctors)) await api.del(`/doctors/${id}`).catch(() => {});
    }
    throw e;
  }

  const failed: string[] = [];
  let uploaded = 0;
  let n = 0;
  for (const f of data.files) {
    onProgress(`Restoring photos and files · ${++n} of ${data.files.length}`);
    const bytes = f.path ? entries.get(f.path) : undefined;
    const owner = ids[OWNER_TABLE[f.owner_type]]?.[f.owner_id];
    if (!bytes || !owner) {
      failed.push(f.name ?? f.path ?? f.id);
      continue;
    }
    const form = new FormData();
    form.set("file", new File([bytes as BlobPart], f.name ?? f.path!.split("/").pop()!, { type: f.mime_type }));
    form.set("owner_type", f.owner_type);
    form.set("owner_id", owner);
    try {
      await api.post("/files", form);
      uploaded++;
    } catch {
      failed.push(f.name ?? f.path!);
    }
  }
  return { records, files: uploaded, failed };
}

const LAST_BACKUP_KEY = "mv:last-backup";

/** When this phone last made a backup (kept on the phone only). */
export function lastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function markBackedUp() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    // private mode: nothing to remember
  }
}
