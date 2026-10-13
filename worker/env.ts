export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  AI: Ai;
  /** Local development only: "1" returns canned AI results instead of calling Workers AI. */
  AI_MOCK?: string;
}

/** Set by requireDevice for every authenticated request. */
export interface AuthVars {
  vaultId: string;
  deviceId: string;
}

export type AppEnv = { Bindings: Env; Variables: AuthVars };
