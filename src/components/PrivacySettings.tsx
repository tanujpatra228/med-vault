import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import type { VaultInfo } from "@shared/types";
import { EMAIL_RE } from "@shared/privacy";
import { authApi, usePrivacyMeta } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { formatDate } from "@/lib/format";

/** Settings → Privacy: AI on/off (withdrawing is as easy as allowing), security contact, rights. */
export function PrivacySettings({ vault }: { vault: VaultInfo }) {
  const qc = useQueryClient();
  const meta = usePrivacyMeta();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ai = !!vault.ai_consent_at;
  const refresh = () => qc.invalidateQueries();

  const toggleAi = async () => {
    setBusy(true);
    try {
      await authApi.setAiConsent(!ai);
      await refresh();
      toast.success(ai ? "AI reading switched off" : "AI reading switched on");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const value = email ?? vault.contact_email ?? "";
  const changed = email !== null && email.trim() !== (vault.contact_email ?? "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="type-body font-semibold">AI reading</div>
          <p className="type-label text-ink-muted">
            {ai ? `On since ${formatDate(vault.ai_consent_at!.slice(0, 10))}. Photos you scan and medicine checks go to our AI provider.` : "Off. Forms are filled by hand; medicine checks use built-in rules only."}
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={toggleAi}>
          {ai ? "Turn off" : "Turn on"}
        </Button>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.trim() && !EMAIL_RE.test(value.trim())) return toast.error("That email address does not look right");
          await authApi.setContactEmail(value.trim());
          await refresh();
          setEmail(null);
          toast.success(value.trim() ? "Security contact saved" : "Security contact removed");
        }}
      >
        <Field label="Security contact email (optional)" hint="Used only to tell you if your data is ever affected by a security problem. Never for anything else.">
          <div className="flex gap-2">
            <Input type="email" inputMode="email" value={value} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {changed && <Button type="submit">Save</Button>}
          </div>
        </Field>
      </form>

      <div className="flex flex-col gap-2 rounded-sm border border-rule bg-sheet p-4 type-label text-ink-muted">
        <div className="flex items-center gap-2 type-body font-semibold text-ink">
          <ShieldCheck className="size-5 text-moss" /> Your data, your choice
        </div>
        <p>
          {vault.consent_at ? `You agreed to privacy notice v${vault.consent_version} on ${formatDate(vault.consent_at.slice(0, 10))}. ` : ""}
          Take a copy with Backup, edit anything, or delete the vault below. No ads, no tracking, never sold.
        </p>
        <p>
          Questions or complaints:{" "}
          {meta.data?.contact ? (
            <a className="text-iris underline" href={`mailto:${meta.data.contact}`}>
              {meta.data.contact}
            </a>
          ) : (
            "the person who runs this Med Vault"
          )}
          . You can also complain to the Data Protection Board of India.
        </p>
        <Link to="/privacy" className="text-iris underline">
          Read the privacy notice
        </Link>
      </div>
    </div>
  );
}
