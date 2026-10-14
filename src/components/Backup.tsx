import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArchiveRestore, Download, Share2 } from "lucide-react";
import { useDoctors, useMembers } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { buildBackup, lastBackup, markBackedUp, readBackup, restoreBackup } from "@/lib/backup";
import { plural, relativeDays } from "@/lib/format";
import { Page, TopBar } from "./layout";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const canShareFiles = () => {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.zip", { type: "application/zip" })] });
  } catch {
    return false;
  }
};

/** Settings → Backup: download (or share to Drive) one ZIP with everything. */
export function BackupCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState(lastBackup);
  const members = useMembers();
  const doctors = useDoctors();
  const empty = members.data?.length === 0 && doctors.data?.length === 0;

  const run = async (share: boolean) => {
    setBusy("Starting…");
    try {
      const { blob, filename } = await buildBackup(setBusy);
      const file = new File([blob], filename, { type: "application/zip" });
      if (share) {
        try {
          await navigator.share({ files: [file], title: filename });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          saveBlob(blob, filename);
        }
      } else saveBlob(blob, filename);
      markBackedUp();
      setLast(lastBackup());
      toast.success("Backup ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="type-label text-ink-muted">
        One ZIP with every record, photo and PDF. Keep it on Google Drive or a computer: if every phone and the recovery key are lost, it brings the vault back. It also opens on any computer
        without the app ("Open me.html").
      </p>
      {busy ? (
        <div className="rounded-sm border border-iris bg-iris-surface px-4 py-3 type-label text-ink" role="status">
          {busy}
        </div>
      ) : (
        <div className={canShareFiles() ? "grid grid-cols-2 gap-2" : "grid"}>
          <Button variant="secondary" onClick={() => run(false)}>
            <Download /> Download backup
          </Button>
          {canShareFiles() && (
            <Button variant="secondary" onClick={() => run(true)}>
              <Share2 /> Save to Drive…
            </Button>
          )}
        </div>
      )}
      <p className="type-caption text-ink-faint">{last ? `Last backup from this phone: ${relativeDays(last)}` : "No backup made from this phone yet."}</p>
      {empty && (
        <Button variant="ghost" asChild>
          <Link to="/restore">
            <ArchiveRestore /> Restore from a backup
          </Link>
        </Button>
      )}
    </div>
  );
}

/** Restore a backup ZIP into this (empty) vault. */
export function RestorePage() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ records: number; files: number; failed: string[] } | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy("Reading the backup…");
    try {
      const backup = await readBackup(file);
      const r = await restoreBackup(backup, setBusy);
      setResult(r);
      await qc.invalidateQueries();
      if (!r.failed.length) {
        toast.success(`Restored ${plural(r.records, "record")} and ${plural(r.files, "file")}`);
        navigate("/", { replace: true });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <TopBar back="/settings" title="Settings" />
      <Page>
        <h1 className="mt-6 mb-4 display-lg">Restore a backup</h1>
        <p className="mb-6 text-ink-muted">Pick a Med Vault backup ZIP. Every member, medicine, prescription, report and photo in it is added to this vault. Only works while this vault is empty.</p>
        {result ? (
          <div className="flex flex-col gap-3 rounded-sm border border-rust bg-rust-surface p-4 text-rust">
            <p className="font-semibold">
              Restored {plural(result.records, "record")} and {plural(result.files, "file")}. {plural(result.failed.length, "file")} could not be restored:
            </p>
            <ul className="list-disc pl-5 type-label">
              {result.failed.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <Button asChild>
              <Link to="/">Open the vault</Link>
            </Button>
          </div>
        ) : busy ? (
          <div className="rounded-sm border border-iris bg-iris-surface px-4 py-3 type-label" role="status">
            {busy}
          </div>
        ) : (
          <Button className="w-full" onClick={() => input.current?.click()}>
            <ArchiveRestore /> Choose backup file
          </Button>
        )}
        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </Page>
    </>
  );
}
