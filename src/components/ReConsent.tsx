import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePrivacyMeta } from "@/api/auth";
import { authApi } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/Mark";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { ConsentChecks, consentGiven, type ConsentState } from "@/components/ConsentChecks";

/**
 * Shown once to vaults created before the current privacy notice (or after it changes). The
 * family can agree, or take a backup and delete instead: Settings stays reachable without agreeing.
 */
export function ReConsent({ first }: { first: boolean }) {
  const meta = usePrivacyMeta();
  const qc = useQueryClient();
  const [c, setC] = useState<ConsentState>({ notice: false, guardian: false });
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto w-full max-w-[640px] px-5 py-10">
      <Wordmark />
      <h1 className="mt-10 mb-3 display-lg">{first ? "Please read how your data is handled" : "The privacy notice has changed"}</h1>
      <p className="mb-6 text-ink-muted">Nothing about your records changes. Med Vault now asks every family to confirm this before continuing.</p>
      <div className="max-h-[50dvh] overflow-y-auto rounded-sm border border-rule bg-sheet p-4">
        <PrivacyNotice meta={meta.data} />
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <ConsentChecks value={c} onChange={setC} />
        <Button
          disabled={!consentGiven(c) || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await authApi.consent();
              await qc.invalidateQueries({ queryKey: ["auth"] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
        >
          Agree and continue
        </Button>
        <Button asChild variant="ghost">
          <Link to="/settings">Not agreeing? Download a backup or delete the vault</Link>
        </Button>
      </div>
    </main>
  );
}
