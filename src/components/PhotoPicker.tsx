import { useEffect, useMemo, useRef } from "react";
import { Camera, FileText, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Pending (not yet uploaded) photos/PDFs. Camera opens the back camera on Android. */
export function PhotoPicker({ files, onChange, label = "Photos" }: { files: File[]; onChange: (files: File[]) => void; label?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((p) => p && URL.revokeObjectURL(p)), [previews]);

  const add = (list: FileList | null) => {
    if (list?.length) onChange([...files, ...Array.from(list)]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="type-label text-ink-muted">{label}</div>
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative aspect-square overflow-hidden rounded-sm border border-rule bg-paper">
              {previews[i] ? (
                <img src={previews[i]!} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-ink-faint">
                  <FileText />
                  <span className="w-full truncate text-center type-caption">{f.name}</span>
                </div>
              )}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-sm bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()}>
          <Camera /> Take photo
        </Button>
        <Button type="button" variant="secondary" onClick={() => galleryRef.current?.click()}>
          <ImagePlus /> Gallery / PDF
        </Button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
