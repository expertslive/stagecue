/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The dev API target is configurable via the VITE_API_TARGET env var so each developer
// can point Vite at whichever backend they're running locally:
//   - `dotnet run` in src/EventStageTimer.Api/ → http://localhost:5050 (default)
//   - `docker compose up` → http://localhost:8080
// Drop the override into `src/web/.env.local` (gitignored), e.g.:
//   VITE_API_TARGET=http://localhost:8080
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_TARGET || "http://localhost:5050";
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/hub": { target: apiTarget, changeOrigin: true, ws: true },
        // /r/{code}/info|branding|ping and /e/{code}/info are API endpoints; the
        // matching SPA routes (/r/{code}/speaker, /r/{code}/door, /e/{code}/lobby)
        // must stay client-side, so we proxy only the known API suffixes.
        "^/r/[^/]+/(info|branding|ping)$": { target: apiTarget, changeOrigin: true },
        "^/e/[^/]+/(info|branding)$": { target: apiTarget, changeOrigin: true },
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
  };
});
