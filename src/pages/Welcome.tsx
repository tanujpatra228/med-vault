import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, guessDeviceName } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { Wordmark } from "@/components/Mark";
import { RecoveryKeyCard } from "@/components/RecoveryKey";

type Mode = "start" | "join" | "recover" | "saved-key";

/** First screen on a device that is not linked to a vault yet. No signup: create, join or recover. */
export function Welcome() {
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const linkCode = window.location.pathname === "/link" ? (params.get("code") ?? "") : "";
  const [mode, setMode] = useState<Mode>(linkCode ? "join" : "start");
  const [vaultName, setVaultName] = useState("");
  const [deviceName, setDeviceName] = useState(guessDeviceName);
  const [code, setCode] = useState(linkCode);
  const [key, setKey] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    window.history.replaceState(null, "", "/");
    await qc.invalidateQueries({ queryKey: ["auth"] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const deviceField = (
    <Field label="Name this device" hint="So you can recognise it later in Settings">
      <Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
    </Field>
  );
  const errorLine = error && <p className="type-label text-rust">{error}</p>;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5 py-10">
      <Wordmark />

      {mode === "start" && (
        <>
          <h1 className="mt-12 mb-3 statement-lg">Every prescription, report and medicine for your family, in one place.</h1>
          <p className="mb-10 text-ink-muted">No signup. Your vault lives on this phone and syncs to any phone you link.</p>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await authApi.createVault(vaultName, deviceName);
                setCreated({ name: r.vault.name, key: r.recovery_key });
                setMode("saved-key");
              });
            }}
          >
            <Field label="Vault name" hint="e.g. Patra family">
              <Input value={vaultName} onChange={(e) => setVaultName(e.target.value)} autoFocus />
            </Field>
            {deviceField}
            {errorLine}
            <Button type="submit" className="w-full" disabled={busy || !vaultName.trim()}>
              {busy ? "Creating" : "Create my vault"}
            </Button>
          </form>
          <div className="mt-10 border-t border-rule pt-6">
            <div className="meta mb-3 text-ink-faint">Already have a vault?</div>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" onClick={() => (setError(null), setMode("join"))}>
                Link with a code from another phone
              </Button>
              <Button variant="link" className="self-center" onClick={() => (setError(null), setMode("recover"))}>
                I lost my phone: use recovery key
              </Button>
            </div>
          </div>
        </>
      )}

      {mode === "join" && (
        <>
          <h1 className="mt-12 mb-3 statement-lg">Link this phone to your vault.</h1>
          <p className="mb-8 text-ink-muted">On a phone that already has the vault, open Settings, tap "Link another device" and enter the code here.</p>
          <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), run(async () => (await authApi.link(code, deviceName), await enter())))}>
            <Field label="Link code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" className="num text-center text-[20px] tracking-[0.15em] uppercase" autoCapitalize="characters" autoComplete="one-time-code" autoFocus={!linkCode} />
            </Field>
            {deviceField}
            {errorLine}
            <Button type="submit" className="w-full" disabled={busy || code.replace(/[^0-9a-z]/gi, "").length < 8}>
              {busy ? "Linking" : "Link this phone"}
            </Button>
            <Button type="button" variant="link" className="self-center" onClick={() => (setError(null), setMode("start"))}>
              Back
            </Button>
          </form>
        </>
      )}

      {mode === "recover" && (
        <>
          <h1 className="mt-12 mb-3 statement-lg">Open your vault with its recovery key.</h1>
          <p className="mb-8 text-ink-muted">The key you saved when you created the vault. It looks like XXXX-XXXX-XXXX-XXXX-XXXX.</p>
          <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), run(async () => (await authApi.recover(key, deviceName), await enter())))}>
            <Field label="Recovery key">
              <Input value={key} onChange={(e) => setKey(e.target.value)} className="num uppercase" autoCapitalize="characters" autoComplete="off" autoFocus />
            </Field>
            {deviceField}
            {errorLine}
            <Button type="submit" className="w-full" disabled={busy || key.replace(/[^0-9a-z]/gi, "").length < 20}>
              {busy ? "Opening" : "Open vault"}
            </Button>
            <Button type="button" variant="link" className="self-center" onClick={() => (setError(null), setMode("start"))}>
              Back
            </Button>
          </form>
        </>
      )}

      {mode === "saved-key" && created && (
        <>
          <h1 className="mt-12 mb-3 statement-lg">Save your recovery key.</h1>
          <p className="mb-8 text-ink-muted">
            There is no password and no account. If you lose every linked phone, this key is the <strong className="font-semibold text-ink">only</strong> way back into "{created.name}". Save it somewhere safe, like your password manager or a WhatsApp message to yourself.
          </p>
          <RecoveryKeyCard recoveryKey={created.key} vaultName={created.name} />
          <label className="mt-8 flex min-h-12 items-center gap-3">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-5 accent-(--iris)" />
            <span>I have saved my recovery key</span>
          </label>
          <Button className="mt-4 w-full" disabled={!confirmed} onClick={enter}>
            Open my vault
          </Button>
        </>
      )}
    </main>
  );
}
