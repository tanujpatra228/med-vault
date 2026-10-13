import { useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { ScanText } from "lucide-react";
import type { ScanKind } from "@shared/types";
import { useScan, type ScanResponse } from "@/api/hooks";
import { Button } from "@/components/ui/button";

const LABELS: Record<ScanKind, { idle: string; busy: string }> = {
  prescription: { idle: "Read prescription with AI", busy: "Reading prescription" },
  medicine: { idle: "Read medicine with AI", busy: "Reading medicine" },
  report: { idle: "Read report with AI", busy: "Reading report" },
};

/**
 * Scans the first photo already picked, or opens the camera if there is none.
 * A newly taken photo is also handed to `onPhoto` so it gets attached to the record.
 */
export function ScanButton({
  kind,
  photos,
  onPhoto,
  onResult,
}: {
  kind: ScanKind;
  photos: File[];
  onPhoto: (file: File) => void;
  onResult: (result: ScanResponse) => void;
}) {
  const scan = useScan();
  const cameraRef = useRef<HTMLInputElement>(null);
  const image = photos.find((f) => f.type.startsWith("image/"));

  const run = async (file: File) => {
    try {
      const result = await scan.mutateAsync({ kind, file });
      onResult(result);
      toast.success("Filled from the photo. Check every field before saving.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read this photo");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full border-iris text-iris hover:border-iris-strong hover:text-iris-strong"
        disabled={scan.isPending}
        onClick={() => (image ? run(image) : cameraRef.current?.click())}
      >
        <ScanText className={scan.isPending ? "animate-pulse" : undefined} />
        {scan.isPending ? LABELS[kind].busy : image ? LABELS[kind].idle : `Take photo and ${LABELS[kind].idle.charAt(0).toLowerCase()}${LABELS[kind].idle.slice(1)}`}
      </Button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) {
            onPhoto(f);
            run(f);
          }
        }}
      />
    </>
  );
}

/** Shown after a scan: AI output is a suggestion and must be checked. */
export function AiNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-iris bg-iris-surface p-4 type-label text-ink" role="status">
      <div className="meta mb-1 text-iris">Filled by AI</div>
      Check every field against the photo before saving. AI can misread handwriting.
      {children && <div className="mt-2 text-ink-muted">{children}</div>}
    </div>
  );
}
