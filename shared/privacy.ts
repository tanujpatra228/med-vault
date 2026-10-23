// The privacy notice: one version number, bumped whenever the notice changes in a way people
// must agree to again. See docs/COMPLIANCE.md.

export const PRIVACY_VERSION = 1;
export const PRIVACY_UPDATED = "2026-10-23";

/** Public details shown in the notice (configured per deployment in wrangler.jsonc "vars"). */
export interface PrivacyMeta {
  version: number;
  updated: string;
  operator: string | null;
  contact: string | null;
}

/** What the person creating a vault (or agreeing to a new notice version) confirms. */
export interface ConsentInput {
  version: number;
  /** 18 or older, adding records for themselves, as parent/guardian, or with the family's permission. */
  guardian: boolean;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
