import { Link } from "react-router";

export interface ConsentState {
  notice: boolean;
  guardian: boolean;
}

export const consentGiven = (c: ConsentState) => c.notice && c.guardian;

/** The two confirmations for creating a vault or agreeing to a new privacy notice. Never pre-ticked. */
export function ConsentChecks({ value, onChange }: { value: ConsentState; onChange: (v: ConsentState) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-rule bg-sheet p-4">
      <label className="flex gap-3 type-label">
        <input type="checkbox" checked={value.notice} onChange={(e) => onChange({ ...value, notice: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-(--iris)" />
        <span>
          I have read the{" "}
          <Link to="/privacy" target="_blank" className="text-iris underline">
            privacy notice
          </Link>{" "}
          and agree to my family's health records being stored as it describes.
        </span>
      </label>
      <label className="flex gap-3 type-label">
        <input type="checkbox" checked={value.guardian} onChange={(e) => onChange({ ...value, guardian: e.target.checked })} className="mt-0.5 size-5 shrink-0 accent-(--iris)" />
        <span>I am 18 or older, and I add records for myself, as a parent or guardian, or with each family member's permission.</span>
      </label>
    </div>
  );
}
