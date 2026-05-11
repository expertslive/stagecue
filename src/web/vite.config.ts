/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:5050", changeOrigin: true },
      "/hub": { target: "http://localhost:5050", changeOrigin: true, ws: true },
      // /r/{code}/info|branding|ping and /e/{code}/info are API endpoints; the
      // matching SPA routes (/r/{code}/speaker, /r/{code}/door, /e/{code}/lobby)
      // must stay client-side, so we proxy only the known API suffixes.
      "^/r/[^/]+/(info|branding|ping)$": { target: "http://localhost:5050", changeOrigin: true },
      "^/e/[^/]+/(info|branding)$": { target: "http://localhost:5050", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
