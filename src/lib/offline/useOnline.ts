import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { pendingReadings } from "./outbox";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Whether the phone has a connection, updated live. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/** Readings saved on this phone that have not been sent yet (shown with a "waiting to send" mark). */
export const usePendingReadings = () => useQuery({ queryKey: ["outbox"], queryFn: pendingReadings, networkMode: "always", staleTime: Infinity });
