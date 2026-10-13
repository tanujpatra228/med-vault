import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for pure functions: no Cloudflare plugin, no Workers runtime.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: { include: ["worker/**/*.test.ts", "src/**/*.test.ts", "shared/**/*.test.ts"] },
});
