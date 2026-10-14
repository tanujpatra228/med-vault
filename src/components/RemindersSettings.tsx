import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Check } from "lucide-react";
import { DEFAULT_PREFS, type ReminderPrefs } from "@shared/reminders";
import { useMembers } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { disableReminders, enableReminders, loadReminders, pushSupported, saveReminders, sendTestReminder } from "@/lib/push";

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-2">
      <span>
        <span className="block type-body">{label}</span>
        {hint && <span className="block type-caption text-ink-faint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-(--iris)" />
    </label>
  );
}

const SLOTS = ["Morning", "Afternoon", "Night"] as const;

/** Settings → Reminders, per phone: what to be reminded of, when, and for whom. */
export function RemindersSettings() {
  const members = useMembers();
  const [state, setState] = useState<"loading" | "off" | "on" | "unsupported">(pushSupported() ? "loading" : "unsupported");
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!pushSupported()) return;
    loadReminders().then((r) => {
      if (r) {
        setSub(r.sub);
        setPrefs(r.prefs);
        setState("on");
      } else setState("off");
    });
  }, []);

  /** Changes save themselves, half a second after the last tap. */
  const update = (patch: Partial<ReminderPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!sub) return;
      try {
        setPrefs(await saveReminders(sub, next));
        setSaved(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    }, 500);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (state === "unsupported")
    return <p className="type-label text-ink-muted">This browser cannot show reminders. On Android, open Med Vault in Chrome and add it to the home screen.</p>;
  if (state === "loading") return <p className="type-label text-ink-faint">Checking this phone…</p>;

  if (state === "off")
    return (
      <div className="flex flex-col gap-3">
        <p className="type-label text-ink-muted">
          Get a notification when medicines are due (weekly and changing doses included), the day before a follow-up, and once a month if there is no backup. Set up separately on each phone.
        </p>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await enableReminders(prefs);
              setSub(r.sub);
              setPrefs(r.prefs);
              setState("on");
              toast.success("Reminders are on for this phone");
            })
          }
        >
          <Bell /> Remind me on this phone
        </Button>
        <p className="type-caption text-ink-faint">Messages are encrypted to this phone; Google's push service delivers them but cannot read them.</p>
      </div>
    );

  const people = members.data ?? [];
  const chosen = prefs.members ?? people.map((m) => m.id);
  const toggleMember = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    update({ members: next.length === people.length ? null : next });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 type-body font-semibold">
          <Bell className="size-5 text-moss" /> On for this phone
        </span>
        <span className="flex items-center gap-1 type-caption text-ink-faint" aria-live="polite">
          {saved && (
            <>
              <Check className="size-4" /> Saved
            </>
          )}
        </span>
      </div>

      <div className="rounded-sm border border-rule bg-sheet px-4 py-2 [&>*+*]:border-t [&>*+*]:border-rule-soft">
        <div>
          <Toggle label="Medicine times" hint="Only what is due that day: weekly and changing doses follow their schedule" checked={prefs.dose} onChange={(dose) => update({ dose })} />
          {prefs.dose && (
            <div className="grid grid-cols-3 gap-2 pb-3">
              {SLOTS.map((label, i) => (
                <label key={label} className="flex flex-col gap-1 type-caption text-ink-muted">
                  {label}
                  <Input
                    type="time"
                    value={prefs.times[i]}
                    onChange={(e) => {
                      const times = [...prefs.times] as ReminderPrefs["times"];
                      times[i] = e.target.value || DEFAULT_PREFS.times[i];
                      update({ times });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <Toggle label="Follow-up visits" hint="The day before and on the day" checked={prefs.followups} onChange={(followups) => update({ followups })} />
          {prefs.followups && (
            <label className="flex items-center justify-between gap-3 pb-3 type-caption text-ink-muted">
              Reminder time
              <Input type="time" className="w-32" value={prefs.followup_time} onChange={(e) => update({ followup_time: e.target.value || DEFAULT_PREFS.followup_time })} />
            </label>
          )}
        </div>
        <Toggle label="Monthly backup reminder" hint="Only when no backup was made in 30 days" checked={prefs.backup} onChange={(backup) => update({ backup })} />
        <Toggle label="Show medicine and doctor names" hint="Off: “Maa: 2 medicines”. Names can show on the lock screen." checked={prefs.details} onChange={(details) => update({ details })} />
      </div>

      {people.length > 1 && (
        <div>
          <div className="mb-2 type-label text-ink-muted">Remind about</div>
          <div className="flex flex-wrap gap-2">
            {people.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMember(m.id)}
                  className={cn("flex h-9 items-center gap-1.5 rounded-sm border px-3 type-label", on ? "border-iris bg-iris-surface text-ink" : "border-rule bg-sheet text-ink-faint")}
                >
                  {on && <Check className="size-4 text-iris" />}
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy || !sub} onClick={() =>
            run(async () => {
              await sendTestReminder(sub!);
              toast.success("Test sent. It should appear in a few seconds.");
            })
          }>
          Send a test
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !sub}
          onClick={() =>
            run(async () => {
              await disableReminders(sub!);
              setSub(null);
              setState("off");
              toast.success("Reminders are off for this phone");
            })
          }
        >
          <BellOff /> Turn off
        </Button>
      </div>
    </div>
  );
}
