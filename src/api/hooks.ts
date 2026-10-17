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
  AiUsage,
  FollowUp,
  Visit,
  LabValue,
  LabDraft,
} from "@shared/types";
import { SCAN_MAX_DATA_URL } from "@shared/types";
import type { ReviewResponse } from "@shared/review";
import type { DuplicateMatch } from "@shared/reports";
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

/** `pdf` is set when a PDF was read: as its text, or as an image of page 1 (a scanned PDF). */
export type ScanResponse = ScanResult & { model: string; ai: AiUsage; pdf?: { pages: number; as: "text" | "image" } };

/**
 * Reads a photo or PDF with AI. A PDF sends its text, or page 1 as an image when it is a scan.
 * Results are suggestions for the form, never saved directly.
 */
export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: ScanKind; file: File }) => {
      if (file.type === "application/pdf") {
        const { pdfForScan } = await import("@/lib/pdf");
        const { pages, ...input } = await pdfForScan(file);
        const result = await api.post<ScanResponse>("/ai/scan", { kind, ...input });
        return { ...result, pdf: { pages, as: "text" in input ? ("text" as const) : ("image" as const) } };
      }
      return api.post<ScanResponse>("/ai/scan", { kind, image: await imageToDataUrl(file, SCAN_MAX_DATA_URL) });
    },
    onSuccess: (data) => qc.setQueryData(["ai-usage"], data.ai),
  });
}

// ---------- "Ask your doctor" ----------

export const useReview = (memberId: string) =>
  useQuery({ queryKey: ["review", memberId], queryFn: () => api.get<ReviewResponse>(`/ai/review${qs({ member_id: memberId })}`) });

/** Runs the medicine review (built-in checks + AI). Uses one of the vault's daily AI calls. */
export function useRunReview(memberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ReviewResponse>("/ai/review", { member_id: memberId }),
    onSuccess: (data) => {
      qc.setQueryData(["review", memberId], data);
      qc.invalidateQueries({ queryKey: ["ai-usage"] });
    },
  });
}

/** Today's AI allowance (neurons) for this vault. */
export const useAiUsage = () => useQuery({ queryKey: ["ai-usage"], queryFn: () => api.get<AiUsage>("/ai/usage") });

// ---------- visits ----------

export const useVisits = (memberId: string) =>
  useQuery({ queryKey: ["visits", memberId], queryFn: () => api.get<Visit[]>(`/visits${qs({ member_id: memberId })}`) });
export const useVisit = (id: string | undefined) =>
  useQuery({ queryKey: ["visit", id], queryFn: () => api.get<Visit>(`/visits/${id}`), enabled: !!id });
/** Open follow-ups, overdue first; for one member or the whole family. */
export const useFollowUps = (memberId?: string) =>
  useQuery({ queryKey: ["follow-ups", memberId ?? "all"], queryFn: () => api.get<FollowUp[]>(`/visits/follow-ups${qs({ member_id: memberId })}`) });

// ---------- lab results ----------

/** Every result for a member, oldest first. */
export const useLabs = (memberId: string) => useQuery({ queryKey: ["labs", memberId], queryFn: () => api.get<LabValue[]>(`/labs${qs({ member_id: memberId })}`) });

/** Replaces a report's results. */
export const saveLabValues = (reportId: string, values: LabDraft[]) => api.put<LabValue[]>(`/labs/report/${reportId}`, { values });

/** Saved reports that look like this one (same results, or same date and type without results). */
export const findReportDuplicates = (input: { member_id: string; report_date: string; report_type: string; values: LabDraft[]; exclude_id?: string }) =>
  api.post<DuplicateMatch[]>("/labs/duplicates", input);
