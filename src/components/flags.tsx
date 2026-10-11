import type { Allergy, Condition, Medication } from "@shared/types";
import { Badge } from "@/components/ui/badge";

export function SeverityFlag({ severity }: { severity: Allergy["severity"] }) {
  return <Badge variant={severity === "severe" ? "warn" : "neutral"}>{severity === "severe" ? "Severe" : severity === "moderate" ? "Moderate" : "Mild"}</Badge>;
}

export function ConditionFlag({ status }: { status: Condition["status"] }) {
  return <Badge variant={status === "active" ? "focus" : "neutral"}>{status === "active" ? "Active" : "Resolved"}</Badge>;
}

export function MedFlag({ status }: { status: Medication["status"] }) {
  return <Badge variant={status === "active" ? "ok" : "neutral"}>{status === "active" ? "Taking" : "Stopped"}</Badge>;
}
