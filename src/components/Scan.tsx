import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, useAuth } from "@/api/auth";
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
  const auth = useAuth();
  const qc = useQueryClient();
  const allowed = auth.data?.authenticated ? auth.data.vault.ai_consent : false;
  const [asking, setAsking] = useState(false);
  const start = () => (image ? run(image) : cameraRef.current?.click());

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
        onClick={() => (allowed ? start() : setAsking(true))}
      >
        <ScanText className={scan.isPending ? "animate-pulse" : undefined} />
        {scan.isPending ? LABELS[kind].busy : image ? LABELS[kind].idle : `Take photo and ${LABELS[kind].idle.charAt(0).toLowerCase()}${LABELS[kind].idle.slice(1)}`}
      </Button>
      {asking && (
        <div className="flex flex-col gap-3 rounded-sm border border-iris bg-iris-surface p-4 type-label" role="dialog" aria-label="Allow AI reading">
          <p className="font-semibold text-ink">Allow AI to read your photos?</p>
          <p className="text-ink-muted">
            The photo is sent to Cloudflare Workers AI to read the text. Cloudflare says it does not use it to train AI or share it. Nothing is saved until you check the form and tap Save.
            You can switch this off any time in Settings.{" "}
            <Link to="/privacy" target="_blank" className="text-iris underline">
              Privacy notice
            </Link>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Not now
            </Button>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await authApi.setAiConsent(true);
                  await qc.invalidateQueries({ queryKey: ["auth"] });
                  setAsking(false);
                  start();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save");
                }
              }}
            >
              Allow and read
            </Button>
          </div>
        </div>
      )}
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
