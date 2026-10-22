import { useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router";
import { PRIVACY_VERSION } from "@shared/privacy";
import { PrivacyPage } from "@/pages/Privacy";
import { SearchPage } from "@/pages/Search";
import { ConditionDetail } from "@/pages/ConditionDetail";
import { ReConsent } from "@/components/ReConsent";
import { onlineManager, QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { dehydrateOptions, MAX_AGE, persister } from "@/lib/offline/persist";
import { useLinkPrefetch } from "@/lib/offline/prefetch";
import { clearOfflineData } from "@/lib/offline/store";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ApiError } from "@/api/client";
import { useAuth } from "@/api/auth";
import { Toaster } from "@/components/ui/sonner";
import { Loading } from "@/components/layout";
import { Welcome } from "@/pages/Welcome";
import { SettingsPage } from "@/pages/Settings";
import { RestorePage } from "@/components/Backup";
import { VisitForm } from "@/pages/forms/VisitForm";
import { ReadingForm } from "@/pages/forms/ReadingForm";
import { VisitBrief } from "@/pages/VisitBrief";
import { Home } from "@/pages/Home";
import { MemberPage } from "@/pages/Member";
import { PrescriptionDetail } from "@/pages/PrescriptionDetail";
import { ReportDetail } from "@/pages/ReportDetail";
import { DoctorForm, DoctorsPage } from "@/pages/Doctors";
import { MemberForm } from "@/pages/forms/MemberForm";
import { AllergyForm } from "@/pages/forms/AllergyForm";
import { ConditionForm } from "@/pages/forms/ConditionForm";
import { MedicationForm } from "@/pages/forms/MedicationForm";
import { PrescriptionEdit, PrescriptionNew } from "@/pages/forms/PrescriptionForm";
import { ReportForm } from "@/pages/forms/ReportForm";

// React Query assumes a connection until an "offline" event fires; an app opened offline must not
// try (and fail) every fetch, which would also drop those records from the saved copy.
onlineManager.setOnline(navigator.onLine);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Kept in memory while the app is open, so the saved copy on the phone keeps every screen's records.
      // (Not MAX_AGE: 30 days overflows setTimeout and would drop them at once.)
      gcTime: Infinity,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
    // Saves fail straight away when offline with a clear message, instead of waiting silently.
    mutations: { networkMode: "always" },
  },
});

/** Shows Welcome until this device is linked to a vault. Any 401 from the API sends the user back here. */
function AuthGate() {
  const qc = useQueryClient();
  const me = useAuth();
  useLinkPrefetch();
  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("mv:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mv:unauthorized", onUnauthorized);
  }, [qc]);

  // This phone was logged out or unlinked: remove the records it saved for offline use.
  const signedOut = me.data && !me.data.authenticated;
  useEffect(() => {
    if (signedOut) clearOfflineData();
  }, [signedOut]);

  const { pathname } = useLocation();
  // Offline with nothing saved yet: say so instead of offering to create a new vault.
  const offlineEmpty = !me.data && me.error instanceof ApiError && me.error.status === 0;
  if (me.isPending || offlineEmpty) return <Loading label="Opening Med Vault" />;
  if (!me.data?.authenticated) return <Welcome />;
  // Agree to the current privacy notice first; Settings stays open to back up or delete instead.
  const consent = me.data.vault.consent_version;
  if (consent !== PRIVACY_VERSION && !pathname.startsWith("/settings") && pathname !== "/restore") return <ReConsent first={consent === null} />;
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  { path: "/privacy", element: <PrivacyPage /> },
  {
    element: <AuthGate />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/members/new", element: <MemberForm /> },
      { path: "/m/:memberId/edit", element: <MemberForm /> },
      { path: "/m/:memberId/prescriptions/new", element: <PrescriptionNew /> },
      { path: "/m/:memberId/medications/new", element: <MedicationForm /> },
      { path: "/m/:memberId/reports/new", element: <ReportForm /> },
      { path: "/m/:memberId/allergies/new", element: <AllergyForm /> },
      { path: "/m/:memberId/conditions/new", element: <ConditionForm /> },
      { path: "/m/:memberId/visits/new", element: <VisitForm /> },
      { path: "/m/:memberId/readings/new", element: <ReadingForm /> },
      { path: "/readings/:readingId", element: <ReadingForm /> },
      { path: "/visits/:visitId", element: <VisitForm /> },
      { path: "/m/:memberId/brief", element: <VisitBrief /> },
      { path: "/m/:memberId/:tab?", element: <MemberPage /> },
      { path: "/prescriptions/:prescriptionId", element: <PrescriptionDetail /> },
      { path: "/prescriptions/:prescriptionId/edit", element: <PrescriptionEdit /> },
      { path: "/medications/:medicationId", element: <MedicationForm /> },
      { path: "/reports/:reportId", element: <ReportDetail /> },
      { path: "/reports/:reportId/edit", element: <ReportForm /> },
      { path: "/allergies/:allergyId", element: <AllergyForm /> },
      { path: "/conditions/:conditionId", element: <ConditionDetail /> },
      { path: "/conditions/:conditionId/edit", element: <ConditionForm /> },
      { path: "/search", element: <SearchPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/restore", element: <RestorePage /> },
      { path: "/link", element: <Navigate to="/" replace /> },
      { path: "/doctors", element: <DoctorsPage /> },
      { path: "/doctors/new", element: <DoctorForm /> },
      { path: "/doctors/:doctorId", element: <DoctorForm /> },
      { path: "*", element: <Home /> },
    ],
  },
]);

export function App() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: MAX_AGE, buster: "1", dehydrateOptions }}>
      <RouterProvider router={router} />
      <OfflineBanner />
      <Toaster />
    </PersistQueryClientProvider>
  );
}
