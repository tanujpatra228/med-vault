export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_PASSWORD?: string;
}

export type AppEnv = { Bindings: Env };
