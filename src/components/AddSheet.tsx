import { useNavigate } from "react-router";
import { CalendarCheck, FileText, FlaskConical, HeartPulse, Pill, Plus, ShieldAlert } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

const OPTIONS = [
  { key: "prescriptions", label: "Prescription", hint: "Photo + the medicines on it", icon: FileText },
  { key: "reports", label: "Report", hint: "Blood test, X-ray, scan", icon: FlaskConical },
  { key: "visits", label: "Visit", hint: "Check-up or appointment, with the next follow-up", icon: CalendarCheck },
  { key: "medications", label: "Medicine", hint: "One medicine without a prescription", icon: Pill },
  { key: "allergies", label: "Allergy", hint: "Drug, food or other", icon: ShieldAlert },
  { key: "conditions", label: "Health condition", hint: "e.g. arthritis, diabetes", icon: HeartPulse },
] as const;

/** Floating + button that opens the add menu for a member. */
export function AddSheet({ memberId, memberName }: { memberId: string; memberName: string }) {
  const navigate = useNavigate();
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`Add for ${memberName}`}
          className="fixed right-5 bottom-[calc(20px+env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-sm border border-iris bg-iris pr-5 pl-4 type-label text-on-iris hover:bg-iris-strong"
        >
          <Plus /> Add
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add for {memberName}</DrawerTitle>
          <DrawerDescription>What do you want to save?</DrawerDescription>
        </DrawerHeader>
        <div className="px-5 pb-5">
          {OPTIONS.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(`/m/${memberId}/${key}/new`)}
              className="flex min-h-16 w-full items-center gap-3.5 border-b border-rule-soft py-2.5 text-left last:border-b-0"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-iris-surface text-ink-muted">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block type-body font-semibold">{label}</span>
                <span className="block type-label text-ink-faint">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
