export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  /** Shown in the privacy notice: who runs this deployment and how to reach them (wrangler.jsonc "vars"). */
  OPERATOR_NAME?: string;
  GRIEVANCE_EMAIL?: string;
  /** Local development only: "1" allows push endpoints on localhost and POST /api/push/run. */
  PUSH_ALLOW_LOCAL?: string;
  /** Local development only: "1" returns canned AI results instead of calling Workers AI. */
  AI_MOCK?: string;
}

/** Set by requireDevice for every authenticated request. */
export interface AuthVars {
  vaultId: string;
  deviceId: string;
}

export type AppEnv = { Bindings: Env; Variables: AuthVars };
