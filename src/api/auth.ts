import { useQuery } from "@tanstack/react-query";
import type { AuthState, LinkCode, VaultInfo } from "@shared/types";
import { api } from "./client";

export const useAuth = () => useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthState>("/auth/me"), staleTime: Infinity });
export const useVault = () => useQuery({ queryKey: ["vault"], queryFn: () => api.get<VaultInfo>("/vault") });

export const authApi = {
  createVault: (name: string, device_name: string) =>
    api.post<{ vault: { id: string; name: string }; recovery_key: string }>("/auth/vault", { name, device_name }),
  link: (code: string, device_name: string) => api.post("/auth/link", { code, device_name }),
  recover: (recovery_key: string, device_name: string) => api.post("/auth/recover", { recovery_key, device_name }),
  logout: () => api.post("/auth/logout"),
  linkCode: () => api.post<LinkCode>("/vault/link-code"),
  rotateRecoveryKey: () => api.post<{ recovery_key: string }>("/vault/recovery-key"),
  renameVault: (name: string) => api.patch("/vault", { name }),
  removeDevice: (id: string) => api.del(`/vault/devices/${id}`),
  deleteVault: (confirm_name: string) => api.del2("/vault", { confirm_name }),
};

/** A friendly default device name, editable by the user. */
export function guessDeviceName(): string {
  const ua = navigator.userAgent;
  const model = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1]?.trim();
  if (model && model !== "K") return model;
  if (/Android/i.test(ua)) return "Android phone";
  if (/iPhone|iPad/i.test(ua)) return "iPhone";
  return "This browser";
}

export const linkUrl = (code: string) => `${window.location.origin}/link?code=${encodeURIComponent(code)}`;
