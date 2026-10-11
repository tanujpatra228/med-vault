import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shows a recovery key once, with every way to keep it safe. */
export function RecoveryKeyCard({ recoveryKey, vaultName }: { recoveryKey: string; vaultName: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Med Vault recovery key for "${vaultName}":\n${recoveryKey}\n\nKeep this private. Anyone with it can open the vault.`;

  const copy = async () => {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    toast.success("Recovery key copied");
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Med Vault recovery key", text });
    } catch {
      // user cancelled
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `med-vault-recovery-key.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-sm border border-iris bg-iris-surface px-4 py-5 text-center">
        <div className="meta mb-3 text-ink-muted">Recovery key</div>
        <div className="num text-[19px] leading-8 font-medium tracking-wide break-all text-ink select-all">{recoveryKey}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          <Copy /> {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="secondary" onClick={share} disabled={!("share" in navigator)}>
          <Share2 /> Share
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          <Download /> Save
        </Button>
      </div>
    </div>
  );
}
