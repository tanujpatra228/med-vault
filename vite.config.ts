import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Workers AI only runs on Cloudflare. Locally it needs a Cloudflare login, so it is off unless
  // CF_REMOTE=1; set AI_MOCK=1 in .dev.vars to get canned AI scan results instead.
  plugins: [react(), tailwindcss(), cloudflare({ remoteBindings: process.env.CF_REMOTE === "1" })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
