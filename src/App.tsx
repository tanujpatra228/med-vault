import { useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router";
import { PRIVACY_VERSION } from "@shared/privacy";
import { PrivacyPage } from "@/pages/Privacy";
import { ReConsent } from "@/components/ReConsent";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { useAuth } from "@/api/auth";
import { Toaster } from "@/components/ui/sonner";
import { Loading } from "@/components/layout";
import { Welcome } from "@/pages/Welcome";
import { SettingsPage } from "@/pages/Settings";
import { RestorePage } from "@/components/Backup";
import { VisitForm } from "@/pages/forms/VisitForm";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

/** Shows Welcome until this device is linked to a vault. Any 401 from the API sends the user back here. */
function AuthGate() {
  const qc = useQueryClient();
  const me = useAuth();
  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("mv:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mv:unauthorized", onUnauthorized);
  }, [qc]);

  const { pathname } = useLocation();
  if (me.isPending) return <Loading label="Opening Med Vault" />;
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
      { path: "/visits/:visitId", element: <VisitForm /> },
      { path: "/m/:memberId/brief", element: <VisitBrief /> },
      { path: "/m/:memberId/:tab?", element: <MemberPage /> },
      { path: "/prescriptions/:prescriptionId", element: <PrescriptionDetail /> },
      { path: "/prescriptions/:prescriptionId/edit", element: <PrescriptionEdit /> },
      { path: "/medications/:medicationId", element: <MedicationForm /> },
      { path: "/reports/:reportId", element: <ReportDetail /> },
      { path: "/reports/:reportId/edit", element: <ReportForm /> },
      { path: "/allergies/:allergyId", element: <AllergyForm /> },
      { path: "/conditions/:conditionId", element: <ConditionForm /> },
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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
