import { useEffect, useState } from "react";
import { clearOfflineData } from "@/lib/offline/store";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, History, Link2, Share2 } from "lucide-react";
import type { LinkCode } from "@shared/types";
import { authApi, linkUrl, useVault } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BackupCard } from "@/components/Backup";
import { AiUsageCard } from "@/components/AiUsageCard";
import { PrivacySettings } from "@/components/PrivacySettings";
import { RemindersSettings } from "@/components/RemindersSettings";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Field } from "@/components/Field";
import { RecoveryKeyCard } from "@/components/RecoveryKey";
import { ErrorState, Loading, Page, Section, TopBar } from "@/components/layout";
import { Row, RowList } from "@/components/Row";
import { relativeDays } from "@/lib/format";

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function LinkDevice() {
  const [link, setLink] = useState<LinkCode | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!link) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [link]);

  const left = link ? Math.max(0, Math.floor((Date.parse(link.expires_at) - now) / 1000)) : 0;
  const create = async () => {
    setBusy(true);
    try {
      setLink(await authApi.linkCode());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create a code");
    } finally {
      setBusy(false);
    }
  };

  if (!link || left === 0)
    return (
      <div className="flex flex-col gap-3">
        <p className="type-label text-ink-muted">Open Med Vault on the other phone, tap "Link with a code" and enter the code. Or send it the link.</p>
        <Button variant="secondary" onClick={create} disabled={busy}>
          <Link2 /> {link ? "Code expired: create a new one" : "Link another device"}
        </Button>
      </div>
    );

  const url = linkUrl(link.code);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm border border-iris bg-iris-surface px-4 py-5 text-center">
        <div className="meta mb-2 text-ink-muted">Link code</div>
        <div className="num text-[32px] leading-10 font-medium tracking-[0.12em]">{link.code}</div>
        <div className="mt-2 type-caption text-ink-muted">
          Works once · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }}
        >
          <Copy /> Copy link
        </Button>
        <Button
          variant="secondary"
          disabled={!("share" in navigator)}
          onClick={() => navigator.share({ title: "Join our Med Vault", text: `Open this on your phone to join our Med Vault (code ${link.code}):`, url }).catch(() => {})}
        >
          <Share2 /> Share link
        </Button>
      </div>
      <p className="type-caption text-ink-faint">Only send this to family. Anyone who opens it in the next few minutes gets full access.</p>
    </div>
  );
}

function NewRecoveryKey({ vaultName }: { vaultName: string }) {
  const [key, setKey] = useState<string | null>(null);
  if (key)
    return (
      <div className="flex flex-col gap-3">
        <p className="type-label text-ink-muted">Your old key no longer works. Save this one now: it will not be shown again.</p>
        <RecoveryKeyCard recoveryKey={key} vaultName={vaultName} />
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="type-label text-ink-muted">The recovery key opens the vault if you lose every linked phone. Lost it or think someone saw it? Create a new one.</p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="secondary">Create a new recovery key</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the recovery key?</AlertDialogTitle>
            <AlertDialogDescription>The old key stops working immediately. Linked phones are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="border-iris bg-iris text-on-iris hover:bg-iris-strong hover:text-on-iris" onClick={async () => setKey((await authApi.rotateRecoveryKey()).recovery_key)}>
              Create new key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function SettingsPage() {
  const q = useVault();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");

  const signedOut = async () => {
    qc.clear();
    await clearOfflineData();
    navigate("/", { replace: true });
    await qc.invalidateQueries({ queryKey: ["auth"] });
  };

  if (q.isPending)
    return (
      <>
        <TopBar back="/" />
        <Loading />
      </>
    );
  if (q.isError)
    return (
      <>
        <TopBar back="/" />
        <Page className="pt-6">
          <ErrorState error={q.error} retry={() => q.refetch()} />
        </Page>
      </>
    );
  const v = q.data;
  const onlyDevice = v.devices.length === 1;

  return (
    <>
      <TopBar back="/" title="Family" />
      <Page>
        <h1 className="mt-6 mb-8 display-lg">Settings</h1>

        <Section title="Vault" className="border-t-0 pt-0">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name?.trim()) return;
              await authApi.renameVault(name);
              toast.success("Vault renamed");
              setName(null);
              qc.invalidateQueries();
            }}
          >
            <div className="flex-1">
              <Input aria-label="Vault name" value={name ?? v.name} onChange={(e) => setName(e.target.value)} />
            </div>
            {name !== null && name !== v.name && <Button type="submit">Save</Button>}
          </form>
          <p className="mt-2 type-caption text-ink-faint">
            {v.storage.files} files · {formatBytes(v.storage.bytes)} of 2 GB used
          </p>
        </Section>

        <Section title={`Linked devices · ${v.devices.length}`}>
          <RowList className="mb-4">
            {v.devices.map((d) => (
              <Row
                key={d.id}
                to={`/settings/activity?device=${d.id}`}
                title={d.name}
                subtitle={d.current ? "This device" : `Last used ${relativeDays(d.last_seen_at)}`}
                action={
                  d.current ? (
                    <Badge variant="focus">You</Badge>
                  ) : (
                    <ConfirmDelete
                      what={`"${d.name}"`}
                      detail="That phone will lose access to this vault. You can link it again later."
                      onConfirm={async () => {
                        await authApi.removeDevice(d.id);
                        await q.refetch();
                      }}
                      trigger={
                        <Button variant="ghost" size="sm" className="text-rust">
                          Remove
                        </Button>
                      }
                    />
                  )
                }
              />
            ))}
          </RowList>
          <Button asChild variant="secondary" className="mb-3 w-full">
            <Link to="/settings/activity">
              <History /> See activity: which phone changed what
            </Link>
          </Button>
          <LinkDevice />
        </Section>

        <Section title="Reminders">
          <RemindersSettings />
        </Section>

        <Section title="Backup">
          <BackupCard />
        </Section>

        <Section title="AI today">
          <AiUsageCard />
        </Section>

        <Section title="Recovery key">
          <NewRecoveryKey vaultName={v.name} />
        </Section>

        <Section title="This device">
          <ConfirmDelete
            what="this device's access"
            detail={
              onlyDevice
                ? "This is the only linked device. You will need your recovery key to open the vault again."
                : "Your records stay in the vault. You can link this phone again with a code."
            }
            onConfirm={async () => {
              await authApi.logout();
              await signedOut();
            }}
            trigger={
              <Button variant="secondary" className="w-full">
                Log out this device
              </Button>
            }
          />
        </Section>

        <Section title="Privacy">
          <PrivacySettings vault={v} />
        </Section>

        <Section title="Danger zone">
          <p className="mb-3 type-label text-ink-muted">Deletes every member, medicine, prescription, report and photo in "{v.name}" for all linked phones. This cannot be undone.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                Delete this vault
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{v.name}" forever?</AlertDialogTitle>
                <AlertDialogDescription>Type the vault name to confirm.</AlertDialogDescription>
              </AlertDialogHeader>
              <Field label="Vault name">
                <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmName.trim() !== v.name}
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      await authApi.deleteVault(confirmName);
                      await signedOut();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not delete");
                    }
                  }}
                >
                  Delete vault
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>
      </Page>
    </>
  );
}
