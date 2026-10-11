import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import type { FileMeta } from "@shared/types";
import { fileUrl } from "@/api/client";
import { useDelete } from "@/api/hooks";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/ConfirmDelete";

/** Saved files: tap an image to view full screen, a PDF opens in a new tab. */
export function FileGallery({ files }: { files: FileMeta[] }) {
  const [open, setOpen] = useState<FileMeta | null>(null);
  const del = useDelete("files");
  if (!files.length) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {files.map((f) =>
          f.mime_type.startsWith("image/") ? (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpen(f)}
              className="aspect-square overflow-hidden rounded-sm border border-rule bg-paper"
              aria-label="View photo"
            >
              <img src={fileUrl(f.id)} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ) : (
            <a
              key={f.id}
              href={fileUrl(f.id)}
              target="_blank"
              rel="noreferrer"
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-rule bg-sheet p-2 text-ink-muted"
            >
              <FileText />
              <span className="w-full truncate text-center type-caption">{f.name ?? "PDF"}</span>
            </a>
          ),
        )}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogTitle className="sr-only">Photo</DialogTitle>
          <DialogDescription className="sr-only">Full size photo</DialogDescription>
          {open && (
            <div className="flex size-full flex-col">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
                <img src={fileUrl(open.id)} alt="" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex justify-center gap-3 p-4">
                <a href={`${fileUrl(open.id)}?download=1`} className="inline-flex h-12 items-center rounded-sm border border-white/40 px-5 type-label text-white">
                  Download
                </a>
                <ConfirmDelete
                  what="this photo"
                  onConfirm={() => del.mutateAsync(open.id).then(() => setOpen(null))}
                  trigger={
                    <button type="button" className="inline-flex h-12 items-center gap-2 rounded-sm border border-white/40 px-5 type-label text-white">
                      <Trash2 className="size-5" /> Delete
                    </button>
                  }
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
