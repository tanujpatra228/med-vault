import type { ReminderPrefs } from "@shared/reminders";
import { api } from "@/api/client";

/** Reminders need a service worker, the Push API and notifications (Chrome on Android has all three). */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration> {
  // Production registers the worker on load; register here too so reminders also work in development.
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

/** This phone's saved settings, or null when reminders are off here. */
export async function loadReminders(): Promise<{ sub: PushSubscription; prefs: ReminderPrefs } | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  try {
    const r = await api.post<{ prefs: ReminderPrefs }>("/push/subscription/find", { endpoint: sub.endpoint });
    return { sub, prefs: r.prefs };
  } catch {
    return null; // subscribed in the browser but not to this vault (e.g. after re-linking)
  }
}

/** Asks for permission (must run from a tap), subscribes and saves the settings. */
export async function enableReminders(prefs: ReminderPrefs): Promise<{ sub: PushSubscription; prefs: ReminderPrefs }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked for Med Vault. Allow them in the browser's site settings, then try again." : "Notifications were not allowed.");
  const reg = await registration();
  const { publicKey } = await api.get<{ publicKey: string }>("/push/key");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return { sub, prefs: await saveReminders(sub, prefs) };
}

export async function saveReminders(sub: PushSubscription, prefs: ReminderPrefs): Promise<ReminderPrefs> {
  const json = sub.toJSON();
  const r = await api.put<{ prefs: ReminderPrefs }>("/push/subscription", { endpoint: sub.endpoint, keys: json.keys, tz: timeZone(), prefs });
  return r.prefs;
}

export async function disableReminders(sub: PushSubscription) {
  await api.del2("/push/subscription", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export const sendTestReminder = (sub: PushSubscription) => api.post("/push/test", { endpoint: sub.endpoint });
