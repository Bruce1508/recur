import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dev server needs inline scripts/styles (React Refresh, HMR), so the CSP is added at build only.
const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "build-csp",
      apply: "build",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: csp },
          injectTo: "head-prepend",
        },
      ],
    },
  ],
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
