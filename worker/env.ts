export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
}

/** Set by requireDevice for every authenticated request. */
export interface AuthVars {
  vaultId: string;
  deviceId: string;
}

export type AppEnv = { Bindings: Env; Variables: AuthVars };
