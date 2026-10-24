import { fileURLToPath, URL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

/**
 * The marketing site for medvault.com: one static page, no JavaScript. Built and deployed apart from
 * the app (landing/wrangler.jsonc). See docs/LANDING.md.
 *
 * The app's address lives in landing/.env (VITE_APP_URL) and is written into the page as %VITE_APP_URL%.
 */

/** Swaps <i data-icon="Pill"></i> for the app's own lucide icon as inline SVG, at build time. */
function inlineIcons(): Plugin {
  return {
    name: "inline-lucide-icons",
    transformIndexHtml(html) {
      return html.replace(/<i data-icon="(\w+)"(?: class="([^"]*)")?><\/i>/g, (_, name: string, cls?: string) => {
        const Icon = (icons as unknown as Record<string, icons.LucideIcon>)[name];
        if (!Icon) throw new Error(`Unknown icon: ${name}`);
        return renderToStaticMarkup(createElement(Icon, { size: 20, strokeWidth: 1.75, "aria-hidden": true, className: cls ?? "" }));
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tailwindcss(), inlineIcons()],
  build: { outDir: "dist", emptyOutDir: true },
});
