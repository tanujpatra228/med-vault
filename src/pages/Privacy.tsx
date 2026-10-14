import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { usePrivacyMeta } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { PrivacyNotice } from "@/components/PrivacyNotice";

/** Public: readable before a vault exists (linked from the Welcome screen). */
export function PrivacyPage() {
  const meta = usePrivacyMeta();
  const navigate = useNavigate();
  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pt-4 pb-16">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}>
        <ArrowLeft /> Back
      </Button>
      <h1 className="mt-4 mb-4 display-lg">Privacy</h1>
      <PrivacyNotice meta={meta.data} />
    </main>
  );
}
