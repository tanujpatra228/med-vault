import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Allergy,
  Condition,
  Doctor,
  DoctorListItem,
  FileMeta,
  FileOwner,
  Medication,
  MemberListItem,
  MemberSummary,
  Prescription,
  PrescriptionCreateInput,
  PrescriptionDetail,
  Report,
  ReportDetail,
  ScanKind,
  ScanResult,
} from "@shared/types";
import { SCAN_MAX_DATA_URL } from "@shared/types";
import { api } from "./client";
import { compressImage, imageToDataUrl } from "@/lib/image";

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ---------- queries ----------

export const useMembers = () => useQuery({ queryKey: ["members"], queryFn: () => api.get<MemberListItem[]>("/members") });
export const useMember = (id: string | undefined) =>
  useQuery({ queryKey: ["members", id], queryFn: () => api.get<MemberListItem>(`/members/${id}`), enabled: !!id });
export const useSummary = (id: string) =>
  useQuery({ queryKey: ["summary", id], queryFn: () => api.get<MemberSummary>(`/members/${id}/summary`) });
export const useDoctors = () => useQuery({ queryKey: ["doctors"], queryFn: () => api.get<DoctorListItem[]>("/doctors") });
export const useDoctor = (id: string | undefined) =>
  useQuery({ queryKey: ["doctors", id], queryFn: () => api.get<DoctorListItem>(`/doctors/${id}`), enabled: !!id });
export const useAllergies = (memberId: string) =>
  useQuery({ queryKey: ["allergies", memberId], queryFn: () => api.get<Allergy[]>(`/allergies${qs({ member_id: memberId })}`) });
export const useConditions = (memberId: string) =>
  useQuery({ queryKey: ["conditions", memberId], queryFn: () => api.get<Condition[]>(`/conditions${qs({ member_id: memberId })}`) });
export const useMedications = (memberId: string) =>
  useQuery({ queryKey: ["medications", memberId], queryFn: () => api.get<Medication[]>(`/medications${qs({ member_id: memberId })}`) });
export const useMedication = (id: string | undefined) =>
  useQuery({ queryKey: ["medication", id], queryFn: () => api.get<Medication>(`/medications/${id}`), enabled: !!id });
export const usePrescriptions = (memberId: string) =>
  useQuery({ queryKey: ["prescriptions", memberId], queryFn: () => api.get<Prescription[]>(`/prescriptions${qs({ member_id: memberId })}`) });
export const usePrescription = (id: string | undefined) =>
  useQuery({ queryKey: ["prescription", id], queryFn: () => api.get<PrescriptionDetail>(`/prescriptions/${id}`), enabled: !!id });
export const useReports = (memberId: string, type?: string) =>
  useQuery({
    queryKey: ["reports", memberId, type ?? "all"],
    queryFn: () => api.get<Report[]>(`/reports${qs({ member_id: memberId, report_type: type })}`),
  });
export const useReport = (id: string | undefined) =>
  useQuery({ queryKey: ["report", id], queryFn: () => api.get<ReportDetail>(`/reports/${id}`), enabled: !!id });
export const useAllergy = (id: string | undefined) =>
  useQuery({ queryKey: ["allergy", id], queryFn: () => api.get<Allergy>(`/allergies/${id}`), enabled: !!id });
export const useCondition = (id: string | undefined) =>
  useQuery({ queryKey: ["condition", id], queryFn: () => api.get<Condition>(`/conditions/${id}`), enabled: !!id });

// ---------- mutations ----------

/**
 * Data is small, so after any write we refetch everything that is cached.
 * Simple and always correct; queries not on screen refetch lazily.
 */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useSave<T>(resource: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      id ? api.patch<T>(`/${resource}/${id}`, data) : api.post<T>(`/${resource}`, data),
    onSuccess: invalidate,
  });
}

export function useDelete(resource: string) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/${resource}/${id}`), onSuccess: invalidate });
}

export function useCreatePrescription() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: PrescriptionCreateInput) => api.post<Prescription>("/prescriptions", input),
    onSuccess: invalidate,
  });
}

export async function uploadFile(ownerType: FileOwner, ownerId: string, file: File): Promise<FileMeta> {
  const prepared = file.type.startsWith("image/") ? await compressImage(file) : file;
  const form = new FormData();
  form.append("file", prepared);
  form.append("owner_type", ownerType);
  form.append("owner_id", ownerId);
  return api.post<FileMeta>("/files", form);
}

export function useUploadFiles() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ ownerType, ownerId, files }: { ownerType: FileOwner; ownerId: string; files: File[] }) => {
      for (const f of files) await uploadFile(ownerType, ownerId, f);
    },
    onSuccess: invalidate,
  });
}

export type { Doctor };

export type ScanResponse = ScanResult & { model: string; scans_left: number };

/** Reads a photo with Workers AI. Results are suggestions for the form, never saved directly. */
export function useScan() {
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: ScanKind; file: File }) =>
      api.post<ScanResponse>("/ai/scan", { kind, image: await imageToDataUrl(file, SCAN_MAX_DATA_URL) }),
  });
}
