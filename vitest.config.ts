import { defineConfig } from "vitest/config";

// Unit tests for pure functions: no Cloudflare plugin, no Workers runtime.
export default defineConfig({
  test: { include: ["worker/**/*.test.ts", "src/**/*.test.ts", "shared/**/*.test.ts"] },
});
