# Speaker View + Minimal Control Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first end-to-end user-facing slice: a public speaker view (Layout A from the spec) and a minimal operator control panel (sign-in, event list, single-room control with transport buttons, time adjustments, schedule list, and live message input). React 19 + Vite SPA wired to the existing backend kernel via REST + SignalR.

**Architecture:** A `src/web/` Vite + React + TS workspace. Dev runs at `http://localhost:5173` and proxies `/api/*` and `/hub/*` to the .NET API at `:5050`. Production build runs `npm run build` → outputs to `src/EventStageTimer.Api/wwwroot/` so the API serves the SPA from a single host. State management: TanStack Query for REST, Zustand for auth-session UI state, a thin `TimerHub` class wrapping `@microsoft/signalr` (with a `useTimerHub` React hook on top). Server-authoritative state, client ticks at 10 Hz from a snapshot using a measured server-clock skew offset.

**Tech Stack:** Vite 7, React 19, TypeScript 5.6, Tailwind 4, shadcn/ui, react-router 7, @microsoft/signalr 10, @tanstack/react-query 5, zustand 5, lucide-react, vitest 2.

**Spec reference:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md` — §4.1 control panel (minimal slice for v1), §4.2 speaker view (Layout A), §6.3 client-side display, §11 access codes.

---

## File structure

```
src/web/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  tsconfig.app.json
  index.html
  tailwind.config.js
  postcss.config.js
  components.json                           # shadcn config
  .gitignore
  src/
    main.tsx                                # App entry
    App.tsx                                 # QueryClient + Router shell
    routes.tsx                              # Route table
    api/
      client.ts                             # fetch wrapper, error handling
      types.ts                              # DTOs that mirror backend
      auth.ts                               # signin/signout/setup-status
      events.ts                             # events CRUD
      rooms.ts                              # rooms list, schedule items list
    hub/
      timerHub.ts                           # SignalR connection wrapper class
      useTimerHub.ts                        # React hook subscribing to RoomStateChanged
    state/
      authStore.ts                          # Zustand: signed-in user info
    theme/
      defaults.ts                           # default CSS-token map
      applyTheme.ts                         # writes vars to a target element
    lib/
      time.ts                               # formatRemaining (MM:SS / +MM:SS / H:MM:SS)
      thresholds.ts                         # mirror of backend ThresholdSelector
      clockSkew.ts                          # measure server-clock offset from snapshot
      cn.ts                                 # classNames helper
    pages/
      SetupPage.tsx                         # first-run bootstrap form
      SignInPage.tsx                        # email + password
      EventsPage.tsx                        # list of events
      RoomControlPage.tsx                   # one-room operator UI
      SpeakerView.tsx                       # public Layout A
      NotFoundPage.tsx
    components/
      ProtectedRoute.tsx                    # Bounce to /signin if not authed
      ui/                                   # shadcn-generated primitives (button, input, card)
        button.tsx
        input.tsx
        card.tsx
      timer/
        Countdown.tsx                       # large countdown render
        MessageOverlay.tsx                  # flashes when message present
        SessionHeader.tsx                   # title + speaker, top of speaker view
        SessionFooter.tsx                   # next-up, bottom of speaker view
      control/
        TransportControls.tsx               # Start/Pause/Resume/Stop/Reset/Skip
        TimeAdjustments.tsx                 # +/- 30s / 1m / 5m / set-exact
        MessageInput.tsx                    # free-text + Clear
        ScheduleList.tsx                    # ordered list with current highlight
    styles/
      globals.css                           # Tailwind base + theme tokens
    test/
      time.test.ts                          # vitest unit tests for formatRemaining
      thresholds.test.ts                    # mirror tests of backend logic
      clockSkew.test.ts

src/EventStageTimer.Api/
  EventStageTimer.Api.csproj                # adds wwwroot serving + SPA fallback
  Program.cs                                # adds UseStaticFiles + MapFallbackToFile
  wwwroot/                                  # produced by `npm run build` (gitignored except .gitkeep)
    .gitkeep
```

---

## Task 1: Scaffold Vite + React + TS workspace under `src/web/`

**Files:** all files under `src/web/` listed in the file structure above (this task creates the skeleton).

- [ ] **Step 1: Create the Vite project**

```bash
mkdir -p src/web
cd src/web
npm create vite@latest . -- --template react-ts
# Answer "y" to the "directory not empty" prompt if it appears
```

Then return to the project root: `cd ../..`.

- [ ] **Step 2: Install runtime deps**

```bash
cd src/web
npm install \
  @microsoft/signalr@^10 \
  @tanstack/react-query@^5 \
  react-router@^7 \
  react-router-dom@^7 \
  zustand@^5 \
  lucide-react@^0 \
  clsx@^2 \
  tailwind-merge@^2
npm install -D \
  tailwindcss@^4 \
  postcss@^8 \
  autoprefixer@^10 \
  @tailwindcss/postcss@^4 \
  vitest@^2 \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  jsdom@^25
cd ../..
```

> Versions are pinned to major-version floors known to work on .NET 10 release timeframe. If a transitive package update breaks things, prefer the latest minor of the same major.

- [ ] **Step 3: Configure Tailwind 4 + PostCSS**

Create `src/web/postcss.config.js`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

Create `src/web/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 4: Replace `src/web/src/index.css` with our globals**

Create `src/web/src/styles/globals.css`:

```css
@import "tailwindcss";

:root {
  --bg: #0a0a0a;
  --surface: #161618;
  --text-primary: #e8e8e8;
  --text-muted: #aaaaaa;
  --primary: #2ecc71;
  --accent: #8ab4f8;
  --warning: #c9b380;
  --overrun: #e74c3c;
  --message-bg: #c0392b;
  --message-text: #ffffff;
}

html, body, #root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text-primary);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
```

Delete `src/web/src/App.css` and `src/web/src/index.css`. Update `src/web/src/main.tsx` to import the new path:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Set up Vite dev proxy to the .NET API**

Replace `src/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
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
      "/r": { target: "http://localhost:5050", changeOrigin: true },
      "/e": { target: "http://localhost:5050", changeOrigin: true },
    },
  },
  build: {
    outDir: "../EventStageTimer.Api/wwwroot",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 6: Add the testing setup file and TS path mapping**

Create `src/web/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

Update `src/web/tsconfig.app.json` `compilerOptions` so `@/` aliases resolve:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals"]
  }
}
```

(Merge into the existing file — don't replace other options the Vite template generated.)

- [ ] **Step 7: Hello-world smoke**

Replace `src/web/src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="flex items-center justify-center h-full">
      <h1 className="text-3xl font-semibold">Event Stage Timer</h1>
    </div>
  );
}
```

```bash
cd src/web && npm run build && cd ../..
```

Expected: build succeeds, output goes to `src/EventStageTimer.Api/wwwroot/`.

- [ ] **Step 8: Update `.gitignore` and commit**

Append to top-level `.gitignore`:

```
# Vite/SPA
src/web/dist/
src/EventStageTimer.Api/wwwroot/*
!src/EventStageTimer.Api/wwwroot/.gitkeep
```

Create the gitkeep:

```bash
mkdir -p src/EventStageTimer.Api/wwwroot
touch src/EventStageTimer.Api/wwwroot/.gitkeep
```

Commit:

```bash
git add src/web src/EventStageTimer.Api/wwwroot/.gitkeep .gitignore
git commit -m "feat(web): scaffold Vite + React 19 + TS + Tailwind 4 workspace"
```

---

## Task 2: API client + DTO types

**Files:**
- Create: `src/web/src/api/client.ts`
- Create: `src/web/src/api/types.ts`

- [ ] **Step 1: Define DTO types matching the backend**

Create `src/web/src/api/types.ts`:

```ts
export type TimerPhase = "Idle" | "PreRoll" | "Running" | "Paused" | "Ended";

export interface Threshold {
  secondsRemaining: number;
  colorToken: string;
  label?: string;
}

export interface SnapshotItem {
  id: string;
  title: string;
  speakerName?: string;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  thresholds: Threshold[];
}

export interface SnapshotNextItem {
  id: string;
  title: string;
  scheduledStartUtc: string;
}

export interface Snapshot {
  roomId: string;
  currentItem: SnapshotItem | null;
  currentRunId: string | null;
  nextItem: SnapshotNextItem | null;
  phase: TimerPhase;
  startedAtUtc: string | null;
  preRollEndsAtUtc: string | null;
  pauseStartedAtUtc: string | null;
  pausedAccumSec: number;
  adjustmentSec: number;
  pauseRemainingMs: number | null;
  currentMessage: string | null;
  serverNowUtc: string;
  version: number;
}

export interface EventDto {
  id: string;
  name: string;
  timeZone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  lobbyAccessCode: string;
}

export interface RoomDto {
  id: string;
  eventId: string;
  name: string;
  accessCode: string;
  defaultPreRollSec: number;
}

export interface ScheduleItemDto {
  id: string;
  position: number;
  title: string;
  speakerName: string | null;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholdsJson: string | null;
}
```

- [ ] **Step 2: Implement the fetch client**

Create `src/web/src/api/client.ts`:

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!resp.ok) {
    let body: unknown;
    try { body = await resp.json(); } catch { body = await resp.text(); }
    throw new ApiError(resp.status, resp.statusText, body);
  }
  if (resp.status === 204) return undefined as T;
  return await resp.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src/api && git commit -m "feat(web): API client + DTO types"
```

---

## Task 3: Auth + Setup API + Zustand auth store

**Files:**
- Create: `src/web/src/api/auth.ts`
- Create: `src/web/src/state/authStore.ts`

- [ ] **Step 1: Auth + setup API calls**

Create `src/web/src/api/auth.ts`:

```ts
import { api } from "./client";

export interface SetupStatus { initialized: boolean }

export const auth = {
  setupStatus: () => api<SetupStatus>("/api/setup/status"),
  setupInitialize: (body: {
    tenantName: string;
    tenantSlug: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerDisplayName: string;
  }) => api<{ tenantId: string; userId: string }>("/api/setup/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  }),
  signIn: (email: string, password: string) =>
    api<{ signedIn: true }>("/api/auth/password/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signOut: () => api<void>("/api/auth/password/signout", { method: "POST" }),
};
```

- [ ] **Step 2: Auth store**

Create `src/web/src/state/authStore.ts`:

```ts
import { create } from "zustand";

interface AuthState {
  signedInEmail: string | null;
  setSignedIn: (email: string) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  signedInEmail: null,
  setSignedIn: (email) => set({ signedInEmail: email }),
  signOut: () => set({ signedInEmail: null }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src && git commit -m "feat(web): auth API + zustand auth store"
```

---

## Task 4: Routing shell + protected route

**Files:**
- Modify: `src/web/src/App.tsx`
- Create: `src/web/src/routes.tsx`
- Create: `src/web/src/components/ProtectedRoute.tsx`
- Create: `src/web/src/lib/cn.ts`
- Create: `src/web/src/pages/SignInPage.tsx`
- Create: `src/web/src/pages/SetupPage.tsx`
- Create: `src/web/src/pages/EventsPage.tsx`
- Create: `src/web/src/pages/RoomControlPage.tsx`
- Create: `src/web/src/pages/SpeakerView.tsx`
- Create: `src/web/src/pages/NotFoundPage.tsx`

- [ ] **Step 1: classNames helper**

Create `src/web/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Routes**

Create `src/web/src/routes.tsx`:

```tsx
import { createBrowserRouter } from "react-router-dom";
import SignInPage from "./pages/SignInPage";
import SetupPage from "./pages/SetupPage";
import EventsPage from "./pages/EventsPage";
import RoomControlPage from "./pages/RoomControlPage";
import SpeakerView from "./pages/SpeakerView";
import NotFoundPage from "./pages/NotFoundPage";
import ProtectedRoute from "./components/ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/setup", element: <SetupPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/", element: <ProtectedRoute><EventsPage /></ProtectedRoute> },
  { path: "/rooms/:roomId", element: <ProtectedRoute><RoomControlPage /></ProtectedRoute> },
  { path: "/r/:accessCode/speaker", element: <SpeakerView /> },
  { path: "*", element: <NotFoundPage /> },
]);
```

- [ ] **Step 3: Protected route**

Create `src/web/src/components/ProtectedRoute.tsx`:

```tsx
import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { ApiError } from "@/api/client";
import { useAuthStore } from "@/state/authStore";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const signedIn = useAuthStore((s) => s.signedInEmail);
  const [checking, setChecking] = useState(!signedIn);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [redirectToSignIn, setRedirectToSignIn] = useState(false);

  useEffect(() => {
    if (signedIn) { setChecking(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const status = await auth.setupStatus();
        if (!status.initialized) { if (!cancelled) setNeedsSetup(true); return; }
        // Probe an authenticated endpoint to detect existing cookie
        await fetch("/api/events", { credentials: "include" }).then((r) => {
          if (r.status === 401) setRedirectToSignIn(true);
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setRedirectToSignIn(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [signedIn]);

  if (checking) return <div className="p-8">Loading…</div>;
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (redirectToSignIn) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Page stubs**

Create `src/web/src/pages/SetupPage.tsx`:

```tsx
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";

export default function SetupPage() {
  const nav = useNavigate();
  const [tenantName, setTenantName] = useState("My Org");
  const [tenantSlug, setTenantSlug] = useState("my-org");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await auth.setupInitialize({ tenantName, tenantSlug, ownerEmail, ownerPassword, ownerDisplayName });
      nav("/signin");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6">First-run setup</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Tenant name" value={tenantName} onChange={setTenantName} />
        <Field label="Tenant slug" value={tenantSlug} onChange={setTenantSlug} />
        <Field label="Owner email" type="email" value={ownerEmail} onChange={setOwnerEmail} />
        <Field label="Owner password" type="password" value={ownerPassword} onChange={setOwnerPassword} />
        <Field label="Display name" value={ownerDisplayName} onChange={setOwnerDisplayName} />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
          Initialize
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (s: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500"
      />
    </label>
  );
}
```

Create `src/web/src/pages/SignInPage.tsx`:

```tsx
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";

export default function SignInPage() {
  const nav = useNavigate();
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await auth.signIn(email, password);
      setSignedIn(email);
      nav("/");
    } catch {
      setError("Sign-in failed. Check email and password.");
    }
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500" />
        </label>
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500" />
        </label>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
          Sign in
        </button>
      </form>
    </div>
  );
}
```

Create `src/web/src/pages/EventsPage.tsx` (real implementation in Task 6):

```tsx
export default function EventsPage() {
  return <div className="p-8">Events list — coming soon.</div>;
}
```

Create `src/web/src/pages/RoomControlPage.tsx` (real implementation in Task 9):

```tsx
export default function RoomControlPage() {
  return <div className="p-8">Room control — coming soon.</div>;
}
```

Create `src/web/src/pages/SpeakerView.tsx` (real implementation in Task 8):

```tsx
export default function SpeakerView() {
  return <div className="p-8">Speaker view — coming soon.</div>;
}
```

Create `src/web/src/pages/NotFoundPage.tsx`:

```tsx
export default function NotFoundPage() {
  return <div className="p-8">Not found.</div>;
}
```

- [ ] **Step 5: App + QueryClient**

Replace `src/web/src/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web/src && git commit -m "feat(web): routing + auth pages + protected route"
```

---

## Task 5: Static assets + SPA fallback in the .NET API

**Files:**
- Modify: `src/EventStageTimer.Api/Program.cs`

- [ ] **Step 1: Serve `wwwroot` and add SPA fallback**

Edit `Program.cs` — add `app.UseStaticFiles()` after `UseRouting()` and `MapFallbackToFile("index.html")` after `MapHub`:

Find the line `app.UseRouting();` and change the pipeline block to:

```csharp
app.UseRouting();
app.UseStaticFiles();
app.UseMiddleware<EventStageTimer.Api.Middleware.PublicRateLimitMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<EventStageTimer.Api.Middleware.TenantResolutionMiddleware>();

app.MapControllers();
app.MapHub<EventStageTimer.Api.Hubs.TimerHub>("/hub/timer");
app.MapOpenApi();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapFallbackToFile("index.html");
```

- [ ] **Step 2: Build the SPA + smoke test the API serves it**

```bash
cd src/web && npm run build && cd ../..
docker run -d -p 1433:1433 --name est-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 mcr.microsoft.com/mssql/server:2022-latest 2>/dev/null || true
sleep 3
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050 &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:5050/ | grep -q "Event Stage Timer" && echo "SPA served"
kill $SERVER_PID
```

Expected: `SPA served`.

- [ ] **Step 3: Commit**

```bash
git add src/EventStageTimer.Api/Program.cs && git commit -m "feat(api): serve SPA from wwwroot with fallback"
```

---

## Task 6: Events list page wired to TanStack Query

**Files:**
- Create: `src/web/src/api/events.ts`
- Modify: `src/web/src/pages/EventsPage.tsx`

- [ ] **Step 1: Events API**

Create `src/web/src/api/events.ts`:

```ts
import { api } from "./client";
import type { EventDto, RoomDto } from "./types";

export const events = {
  list: () => api<EventDto[]>("/api/events"),
  get: (eventId: string) => api<EventDto>(`/api/events/${eventId}`),
  create: (body: { name: string; timeZone: string; startsAtUtc: string; endsAtUtc: string }) =>
    api<EventDto>("/api/events", { method: "POST", body: JSON.stringify(body) }),
  rooms: (eventId: string) => api<RoomDto[]>(`/api/events/${eventId}/rooms`),
};
```

- [ ] **Step 2: Events page**

Replace `src/web/src/pages/EventsPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { events } from "@/api/events";
import { useState } from "react";

export default function EventsPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });
  const [openEvent, setOpenEvent] = useState<string | null>(null);

  if (eventsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (eventsQuery.error) return <div className="p-8 text-red-400">Failed to load events.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Events</h1>
      <ul className="space-y-2">
        {eventsQuery.data!.map((ev) => (
          <li key={ev.id} className="rounded border border-zinc-800 bg-zinc-900">
            <button
              className="w-full text-left p-4 hover:bg-zinc-800/60"
              onClick={() => setOpenEvent(openEvent === ev.id ? null : ev.id)}
            >
              <div className="font-medium">{ev.name}</div>
              <div className="text-xs text-zinc-400">
                {new Date(ev.startsAtUtc).toLocaleString()} — lobby code {ev.lobbyAccessCode}
              </div>
            </button>
            {openEvent === ev.id && <RoomList eventId={ev.id} />}
          </li>
        ))}
      </ul>
      {eventsQuery.data!.length === 0 && (
        <p className="text-zinc-400">No events yet. Create one via the API or seed the dev data.</p>
      )}
    </div>
  );
}

function RoomList({ eventId }: { eventId: string }) {
  const roomsQuery = useQuery({ queryKey: ["rooms", eventId], queryFn: () => events.rooms(eventId) });
  if (roomsQuery.isLoading) return <div className="p-4 text-sm text-zinc-400">Loading rooms…</div>;
  if (roomsQuery.error) return <div className="p-4 text-sm text-red-400">Failed to load rooms.</div>;
  return (
    <ul className="border-t border-zinc-800 divide-y divide-zinc-800">
      {roomsQuery.data!.map((r) => (
        <li key={r.id} className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-zinc-400">access code {r.accessCode}</div>
          </div>
          <Link to={`/rooms/${r.id}`} className="text-blue-400 hover:underline text-sm">Open control →</Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src && git commit -m "feat(web): events list with expandable rooms"
```

---

## Task 7: Time + threshold + clock-skew helpers (with vitest)

**Files:**
- Create: `src/web/src/lib/time.ts`
- Create: `src/web/src/lib/thresholds.ts`
- Create: `src/web/src/lib/clockSkew.ts`
- Test: `src/web/src/test/time.test.ts`
- Test: `src/web/src/test/thresholds.test.ts`

- [ ] **Step 1: Implement `time.ts` (formatRemaining)**

Create `src/web/src/lib/time.ts`:

```ts
/**
 * Formats a remaining millisecond value as MM:SS for ≤59:59,
 * H:MM:SS for ≥1 hour, or +MM:SS / +H:MM:SS when negative (overrun count-up).
 */
export function formatRemaining(remainingMs: number): string {
  const overrun = remainingMs < 0;
  const totalSec = Math.floor(Math.abs(remainingMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return overrun ? `+${body}` : body;
}
```

- [ ] **Step 2: Implement `thresholds.ts` (mirror of backend selector)**

Create `src/web/src/lib/thresholds.ts`:

```ts
import type { Threshold } from "@/api/types";

/**
 * Picks the smallest threshold.secondsRemaining still ≥ remainingMs/1000 — the tightest
 * threshold we've crossed but not yet crossed past. Returns null when no threshold matches
 * (use the --primary token) or when remainingMs <= 0 (use the --overrun token).
 */
export function activeThreshold(thresholds: Threshold[], remainingMs: number): Threshold | null {
  if (remainingMs <= 0 || thresholds.length === 0) return null;
  let best: Threshold | null = null;
  for (const t of thresholds) {
    if (t.secondsRemaining * 1000 < remainingMs) continue;
    if (!best || t.secondsRemaining < best.secondsRemaining) best = t;
  }
  return best;
}

/** Returns the CSS color value for a given remaining time and threshold list. */
export function colorTokenForRemaining(thresholds: Threshold[], remainingMs: number): string {
  if (remainingMs <= 0) return "var(--overrun)";
  const t = activeThreshold(thresholds, remainingMs);
  return t ? `var(--${t.colorToken})` : "var(--primary)";
}
```

- [ ] **Step 3: Implement `clockSkew.ts`**

Create `src/web/src/lib/clockSkew.ts`:

```ts
/**
 * Returns the number of milliseconds to ADD to local Date.now() to get the server's UtcNow.
 * Compute from a snapshot's serverNowUtc, taking the moment we received it as our local
 * reference. Tiny network latency is ignored (~5-50ms is fine for a 1-second timer).
 */
export function measureSkew(serverNowUtcIso: string, localNowMs: number = Date.now()): number {
  return new Date(serverNowUtcIso).getTime() - localNowMs;
}

export function serverNow(skewMs: number): number {
  return Date.now() + skewMs;
}
```

- [ ] **Step 4: Tests for time + thresholds**

Create `src/web/src/test/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRemaining } from "@/lib/time";

describe("formatRemaining", () => {
  it("formats sub-hour positive remaining as MM:SS", () => {
    expect(formatRemaining(125_000)).toBe("02:05");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(59_999)).toBe("00:59");
  });
  it("formats hour-or-more as H:MM:SS", () => {
    expect(formatRemaining(3_660_000)).toBe("1:01:00");
  });
  it("formats negative as overrun with +", () => {
    expect(formatRemaining(-30_000)).toBe("+00:30");
    expect(formatRemaining(-3_660_000)).toBe("+1:01:00");
  });
});
```

Create `src/web/src/test/thresholds.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { activeThreshold, colorTokenForRemaining } from "@/lib/thresholds";

const list = [
  { secondsRemaining: 600, colorToken: "warning" },
  { secondsRemaining: 120, colorToken: "danger" },
  { secondsRemaining: 30, colorToken: "final" },
];

describe("activeThreshold", () => {
  it("picks the smallest matching threshold", () => {
    expect(activeThreshold(list, 700_000)).toBeNull();
    expect(activeThreshold(list, 500_000)?.colorToken).toBe("warning");
    expect(activeThreshold(list, 100_000)?.colorToken).toBe("danger");
    expect(activeThreshold(list, 20_000)?.colorToken).toBe("final");
    expect(activeThreshold(list, 0)).toBeNull();
  });
});

describe("colorTokenForRemaining", () => {
  it("returns --primary when above all thresholds", () => {
    expect(colorTokenForRemaining(list, 700_000)).toBe("var(--primary)");
  });
  it("returns --overrun when ≤ 0", () => {
    expect(colorTokenForRemaining(list, -100)).toBe("var(--overrun)");
    expect(colorTokenForRemaining(list, 0)).toBe("var(--overrun)");
  });
  it("returns the matching threshold's token", () => {
    expect(colorTokenForRemaining(list, 100_000)).toBe("var(--danger)");
  });
});
```

- [ ] **Step 5: Run tests + commit**

```bash
cd src/web && npx vitest run && cd ../..
git add src/web && git commit -m "feat(web): time formatting + threshold selection + clock skew helpers with tests"
```

Expected: 8+ tests pass.

---

## Task 8: SignalR hub wrapper + `useTimerHub` hook

**Files:**
- Create: `src/web/src/hub/timerHub.ts`
- Create: `src/web/src/hub/useTimerHub.ts`

- [ ] **Step 1: TimerHub class wrapping `@microsoft/signalr`**

Create `src/web/src/hub/timerHub.ts`:

```ts
import { HubConnection, HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";
import type { Snapshot } from "@/api/types";

export type SnapshotListener = (snapshot: Snapshot) => void;
export type MessageListener = (roomId: string, message: string | null) => void;

export class TimerHub {
  private conn: HubConnection;
  private snapshotListeners = new Set<SnapshotListener>();
  private messageListeners = new Set<MessageListener>();

  /**
   * @param accessCode 8-char public access code (no dash). Pass null for cookie-authenticated operators.
   */
  constructor(accessCode: string | null) {
    const url = accessCode ? `/hub/timer?code=${encodeURIComponent(accessCode)}` : "/hub/timer";
    this.conn = new HubConnectionBuilder()
      .withUrl(url, {
        // SignalR will negotiate transport. Long polling is the universal fallback.
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents | HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.conn.on("RoomStateChanged", (snap: Snapshot) => {
      this.snapshotListeners.forEach((l) => l(snap));
    });
    this.conn.on("MessageChanged", (payload: { roomId: string; message: string | null }) => {
      this.messageListeners.forEach((l) => l(payload.roomId, payload.message));
    });
  }

  start() { return this.conn.start(); }
  stop() { return this.conn.stop(); }

  onSnapshot(l: SnapshotListener) { this.snapshotListeners.add(l); return () => this.snapshotListeners.delete(l); }
  onMessage(l: MessageListener) { this.messageListeners.add(l); return () => this.messageListeners.delete(l); }

  resync(roomId: string) { return this.conn.invoke<Snapshot | null>("Resync", roomId); }

  // Operator commands (versioned)
  startAuto(roomId: string, version: number) { return this.conn.invoke<Snapshot>("StartAuto", roomId, version); }
  startItem(roomId: string, scheduleItemId: string, version: number) { return this.conn.invoke<Snapshot>("StartItem", roomId, scheduleItemId, version); }
  pause(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Pause", roomId, version); }
  resume(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Resume", roomId, version); }
  stopRoom(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Stop", roomId, version); }
  reset(roomId: string, version: number) { return this.conn.invoke<Snapshot>("Reset", roomId, version); }
  skipNext(roomId: string, version: number) { return this.conn.invoke<Snapshot>("SkipNext", roomId, version); }
  adjustTime(roomId: string, deltaSec: number, version: number) { return this.conn.invoke<Snapshot>("AdjustTime", roomId, deltaSec, version); }
  setExactRemaining(roomId: string, remainingSec: number, version: number) { return this.conn.invoke<Snapshot>("SetExactRemaining", roomId, remainingSec, version); }

  // Unversioned
  setMessage(roomId: string, message: string | null) { return this.conn.invoke<Snapshot>("SetMessage", roomId, message); }
  clearMessage(roomId: string) { return this.conn.invoke<Snapshot>("ClearMessage", roomId); }
}
```

- [ ] **Step 2: React hook**

Create `src/web/src/hub/useTimerHub.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { TimerHub } from "./timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";

export interface UseTimerHubResult {
  hub: TimerHub | null;
  snapshot: Snapshot | null;
  /** Server-clock skew in ms (add to Date.now() to get server time). */
  skewMs: number;
  /** True after the underlying connection has started. */
  ready: boolean;
  error: Error | null;
}

/**
 * Opens a SignalR connection scoped to a single room.
 * Pass `accessCode` for public viewers; pass `null` for authenticated operators
 * (cookie travels automatically via fetch credentials).
 */
export function useTimerHub(roomId: string | null, accessCode: string | null): UseTimerHubResult {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hubRef = useRef<TimerHub | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const hub = new TimerHub(accessCode);
    hubRef.current = hub;

    const offSnap = hub.onSnapshot((snap) => {
      if (cancelled || snap.roomId !== roomId) return;
      setSnapshot(snap);
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    const offMsg = hub.onMessage((rid, message) => {
      if (cancelled || rid !== roomId) return;
      setSnapshot((prev) => (prev ? { ...prev, currentMessage: message } : prev));
    });

    hub.start()
      .then(async () => {
        if (cancelled) return;
        setReady(true);
        const fresh = await hub.resync(roomId);
        if (cancelled || !fresh) return;
        setSnapshot(fresh);
        setSkewMs(measureSkew(fresh.serverNowUtc));
      })
      .catch((e) => { if (!cancelled) setError(e as Error); });

    return () => {
      cancelled = true;
      offSnap();
      offMsg();
      hub.stop().catch(() => { /* ignore */ });
      hubRef.current = null;
    };
  }, [roomId, accessCode]);

  return { hub: hubRef.current, snapshot, skewMs, ready, error };
}
```

- [ ] **Step 3: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): SignalR TimerHub wrapper + useTimerHub hook"
```

---

## Task 9: Speaker view (Layout A)

**Files:**
- Create: `src/web/src/components/timer/Countdown.tsx`
- Create: `src/web/src/components/timer/MessageOverlay.tsx`
- Create: `src/web/src/components/timer/SessionHeader.tsx`
- Create: `src/web/src/components/timer/SessionFooter.tsx`
- Modify: `src/web/src/pages/SpeakerView.tsx`

- [ ] **Step 1: Countdown component**

Create `src/web/src/components/timer/Countdown.tsx`:

```tsx
import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";
import type { Snapshot } from "@/api/types";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
}

/**
 * Computes remaining time at ~10 Hz from the snapshot. The server is the only writer of state;
 * we tick the *display* locally using the measured clock-skew offset.
 */
export default function Countdown({ snapshot, skewMs }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = computeRemaining(snapshot, skewMs);
  const isPreRoll = snapshot.phase === "PreRoll";
  const tokens = snapshot.currentItem?.thresholds ?? [];
  const color = isPreRoll ? "var(--accent)" : colorTokenForRemaining(tokens, remainingMs);
  const label = isPreRoll ? "Starts in" : remainingMs <= 0 ? "Overrun" : "Remaining";

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3">{label}</div>
      <div
        className="font-bold leading-none tabular-nums"
        style={{ color, fontSize: "min(28vw, 360px)", letterSpacing: "-0.04em" }}
      >
        {formatRemaining(remainingMs)}
      </div>
    </div>
  );
}

function computeRemaining(s: Snapshot, skewMs: number): number {
  const serverNow = Date.now() + skewMs;
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) {
    return new Date(s.preRollEndsAtUtc).getTime() - serverNow;
  }
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsedMs = serverNow - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    const totalMs = (s.currentItem.durationSec + s.adjustmentSec) * 1000;
    return totalMs - elapsedMs;
  }
  if (s.phase === "Paused" && s.pauseRemainingMs != null) {
    return s.pauseRemainingMs;
  }
  return 0;
}
```

- [ ] **Step 2: Message overlay**

Create `src/web/src/components/timer/MessageOverlay.tsx`:

```tsx
interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  if (!message) return null;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 px-6 py-2 rounded-md font-semibold text-xl shadow-lg"
      style={{ bottom: "18%", background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Session header + footer**

Create `src/web/src/components/timer/SessionHeader.tsx`:

```tsx
import type { SnapshotItem } from "@/api/types";

export default function SessionHeader({ item }: { item: SnapshotItem | null }) {
  if (!item) return <div className="h-8" />;
  return (
    <div className="absolute top-4 left-6 right-6 flex justify-between text-sm text-zinc-500">
      <span>Now: {item.title}</span>
      {item.speakerName && <span>{item.speakerName}</span>}
    </div>
  );
}
```

Create `src/web/src/components/timer/SessionFooter.tsx`:

```tsx
import type { SnapshotNextItem } from "@/api/types";

export default function SessionFooter({ next }: { next: SnapshotNextItem | null }) {
  if (!next) return null;
  return (
    <div className="absolute bottom-3 left-6 right-6 text-xs text-zinc-600">
      Next: {next.title} ({new Date(next.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
    </div>
  );
}
```

- [ ] **Step 4: SpeakerView page**

Replace `src/web/src/pages/SpeakerView.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Countdown from "@/components/timer/Countdown";
import MessageOverlay from "@/components/timer/MessageOverlay";
import SessionHeader from "@/components/timer/SessionHeader";
import SessionFooter from "@/components/timer/SessionFooter";
import { useTimerHub } from "@/hub/useTimerHub";

export default function SpeakerView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalisedCode = (accessCode ?? "").replace("-", "").toUpperCase();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Resolve roomId from access code via the public test ping (will be replaced by branding endpoint in Plan 4)
  useEffect(() => {
    if (!accessCode) return;
    fetch(`/r/${accessCode}/ping`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "URL not valid" : `Lookup failed (${r.status})`);
        const body = await r.json();
        setRoomId(body.roomId);
      })
      .catch((e) => setResolveError(String(e.message ?? e)));
  }, [accessCode]);

  const { snapshot, skewMs, ready, error } = useTimerHub(roomId, normalisedCode);

  if (resolveError) return <CenterMessage>{resolveError}</CenterMessage>;
  if (!roomId) return <CenterMessage>Connecting…</CenterMessage>;
  if (error) return <CenterMessage>Connection error: {error.message}</CenterMessage>;
  if (!ready || !snapshot) return <CenterMessage>Connecting…</CenterMessage>;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <SessionHeader item={snapshot.currentItem} />
      <div className="flex items-center justify-center w-full h-full">
        <Countdown snapshot={snapshot} skewMs={skewMs} />
      </div>
      <MessageOverlay message={snapshot.currentMessage} />
      <SessionFooter next={snapshot.nextItem} />
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="text-zinc-500">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): speaker view (Layout A) wired to TimerHub"
```

---

## Task 10: Schedule items API + room control transport

**Files:**
- Modify: `src/web/src/api/rooms.ts` (create — api/events.ts has events stuff; rooms gets schedule)
- Create: `src/web/src/components/control/TransportControls.tsx`
- Create: `src/web/src/components/control/ScheduleList.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`

- [ ] **Step 1: Schedule API**

Create `src/web/src/api/rooms.ts`:

```ts
import { api } from "./client";
import type { ScheduleItemDto } from "./types";

export const rooms = {
  schedule: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
};
```

- [ ] **Step 2: TransportControls component**

Create `src/web/src/components/control/TransportControls.tsx`:

```tsx
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { Play, Pause, Square, RotateCcw, SkipForward } from "lucide-react";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  onError?: (e: string) => void;
}

export default function TransportControls({ hub, snapshot, onError }: Props) {
  if (!hub) return null;
  const v = snapshot.version;
  const phase = snapshot.phase;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));

  return (
    <div className="flex flex-wrap gap-2">
      {phase === "Idle" && (
        <Button onClick={() => snapshot.currentItem && handle(hub.startItem(snapshot.roomId, snapshot.currentItem.id, v))}>
          <Play className="size-4" /> Start
        </Button>
      )}
      {phase === "Idle" && snapshot.currentItem === null && (
        <Button onClick={() => handle(hub.startAuto(snapshot.roomId, v))}><Play className="size-4" /> Start (auto)</Button>
      )}
      {phase === "Running" && <Button onClick={() => handle(hub.pause(snapshot.roomId, v))}><Pause className="size-4" /> Pause</Button>}
      {phase === "Paused" && <Button onClick={() => handle(hub.resume(snapshot.roomId, v))}><Play className="size-4" /> Resume</Button>}
      {(phase === "Running" || phase === "Paused") && (
        <Button onClick={() => handle(hub.stopRoom(snapshot.roomId, v))} variant="danger"><Square className="size-4" /> Stop</Button>
      )}
      <Button onClick={() => handle(hub.reset(snapshot.roomId, v))} variant="ghost"><RotateCcw className="size-4" /> Reset</Button>
      <Button onClick={() => handle(hub.skipNext(snapshot.roomId, v))} variant="ghost"><SkipForward className="size-4" /> Skip</Button>
    </div>
  );
}

function Button({ children, onClick, variant = "primary" }: { children: React.ReactNode; onClick: () => void; variant?: "primary" | "danger" | "ghost" }) {
  const style =
    variant === "primary" ? "bg-blue-600 hover:bg-blue-500 text-white"
    : variant === "danger" ? "bg-red-600 hover:bg-red-500 text-white"
    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100";
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium ${style}`}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: ScheduleList component**

Create `src/web/src/components/control/ScheduleList.tsx`:

```tsx
import type { ScheduleItemDto } from "@/api/types";

interface Props {
  items: ScheduleItemDto[];
  currentItemId: string | null;
}

export default function ScheduleList({ items, currentItemId }: Props) {
  return (
    <ol className="rounded border border-zinc-800 divide-y divide-zinc-800">
      {items.map((item) => (
        <li key={item.id} className={`flex justify-between p-3 ${item.id === currentItemId ? "bg-zinc-800/60" : ""}`}>
          <div>
            <div className="text-sm font-medium">{item.title}</div>
            {item.speakerName && <div className="text-xs text-zinc-500">{item.speakerName}</div>}
          </div>
          <div className="text-xs text-zinc-500 text-right">
            <div>{new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <div>{Math.floor(item.durationSec / 60)} min</div>
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="p-3 text-sm text-zinc-500">No items in this room's schedule.</li>}
    </ol>
  );
}
```

- [ ] **Step 4: Wire RoomControlPage**

Replace `src/web/src/pages/RoomControlPage.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { rooms } from "@/api/rooms";
import { useTimerHub } from "@/hub/useTimerHub";
import TransportControls from "@/components/control/TransportControls";
import ScheduleList from "@/components/control/ScheduleList";
import Countdown from "@/components/timer/Countdown";
import { useState } from "react";

export default function RoomControlPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const scheduleQuery = useQuery({
    queryKey: ["schedule", roomId],
    queryFn: () => rooms.schedule(roomId!),
    enabled: !!roomId,
  });
  const { hub, snapshot, skewMs, ready, error } = useTimerHub(roomId ?? null, null);
  const [hubError, setHubError] = useState<string | null>(null);

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (error) return <div className="p-8 text-red-400">Connection error: {error.message}</div>;
  if (!ready || !snapshot) return <div className="p-8">Connecting…</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Room control</h1>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex justify-center">
        <Countdown snapshot={snapshot} skewMs={skewMs} />
      </div>

      <TransportControls hub={hub} snapshot={snapshot} onError={setHubError} />
      {hubError && <p className="text-sm text-red-400">{hubError}</p>}

      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Schedule</h2>
        {scheduleQuery.data && (
          <ScheduleList items={scheduleQuery.data} currentItemId={snapshot.currentItem?.id ?? null} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): room control with transport + schedule list"
```

---

## Task 11: Time adjustments + live message input

**Files:**
- Create: `src/web/src/components/control/TimeAdjustments.tsx`
- Create: `src/web/src/components/control/MessageInput.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`

- [ ] **Step 1: TimeAdjustments component**

Create `src/web/src/components/control/TimeAdjustments.tsx`:

```tsx
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { useState } from "react";

interface Props { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }

const presets = [
  { label: "−5m", deltaSec: -300 },
  { label: "−1m", deltaSec: -60 },
  { label: "−30s", deltaSec: -30 },
  { label: "+30s", deltaSec: 30 },
  { label: "+1m", deltaSec: 60 },
  { label: "+5m", deltaSec: 300 },
];

export default function TimeAdjustments({ hub, snapshot, onError }: Props) {
  const [exact, setExact] = useState("");
  if (!hub) return null;
  const v = snapshot.version;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.label}
            onClick={() => handle(hub.adjustTime(snapshot.roomId, p.deltaSec, v))}
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm font-mono">
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text" placeholder="MM:SS" value={exact} onChange={(e) => setExact(e.target.value)}
          className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800 w-28 text-center font-mono" />
        <button
          onClick={() => {
            const sec = parseMmss(exact);
            if (sec == null) { onError?.("Invalid format. Use MM:SS"); return; }
            handle(hub.setExactRemaining(snapshot.roomId, sec, v));
          }}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">
          Set remaining
        </button>
      </div>
    </div>
  );
}

function parseMmss(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}
```

- [ ] **Step 2: MessageInput component**

Create `src/web/src/components/control/MessageInput.tsx`:

```tsx
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { useState } from "react";

const presets = ["Wrap up", "5 min over", "Q&A time", "Mic check"];

export default function MessageInput({ hub, snapshot, onError }: { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }) {
  const [draft, setDraft] = useState("");
  if (!hub) return null;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={snapshot.currentMessage ? `Currently: ${snapshot.currentMessage}` : "Type a message"}
          className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
        <button
          onClick={() => { handle(hub.setMessage(snapshot.roomId, draft.trim() || null)); setDraft(""); }}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">Send</button>
        <button
          onClick={() => handle(hub.clearMessage(snapshot.roomId))}
          className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Clear</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p}
            onClick={() => handle(hub.setMessage(snapshot.roomId, p))}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">{p}</button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into RoomControlPage**

Update `src/web/src/pages/RoomControlPage.tsx` — add imports and place the new sections after `TransportControls`:

```tsx
import TimeAdjustments from "@/components/control/TimeAdjustments";
import MessageInput from "@/components/control/MessageInput";
```

Insert after `<TransportControls .../>`:

```tsx
      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Adjust time</h2>
        <TimeAdjustments hub={hub} snapshot={snapshot} onError={setHubError} />
      </div>
      <div>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Live message</h2>
        <MessageInput hub={hub} snapshot={snapshot} onError={setHubError} />
      </div>
```

- [ ] **Step 4: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): time adjustments + live message input"
```

---

## Task 12: Final smoke test + sign-out button

**Files:**
- Modify: `src/web/src/pages/EventsPage.tsx` (add sign-out button)

- [ ] **Step 1: Add sign-out**

Add at the top of `EventsPage`'s rendered JSX (just under the `<h1>Events</h1>`):

```tsx
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
```

```tsx
function SignOutButton() {
  const nav = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <button
      onClick={async () => { await auth.signOut(); signOut(); nav("/signin"); }}
      className="text-sm text-zinc-400 hover:text-zinc-200">
      Sign out
    </button>
  );
}
```

And in the page header:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-semibold">Events</h1>
  <SignOutButton />
</div>
```

- [ ] **Step 2: End-to-end smoke**

```bash
docker run -d -p 1433:1433 --name est-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 mcr.microsoft.com/mssql/server:2022-latest 2>/dev/null || true
sleep 3

# Build the SPA into wwwroot
cd src/web && npm run build && cd ../..

# Seed and run
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --seed
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050 &
SERVER_PID=$!
sleep 3

# Confirm SPA + API both respond
curl -sf http://localhost:5050/ | grep -q "Event Stage Timer"
curl -sf http://localhost:5050/health | grep -q '"status":"ok"'

kill $SERVER_PID
```

Open `http://localhost:5050/` in a browser:
1. First load redirects to `/signin` (or `/setup` if DB is empty).
2. Sign in with the seeded owner — `owner@local` / `Strong_Pwd_123`.
3. See the Demo Conference event; expand to see Main Hall.
4. Click "Open control" — countdown reads idle.
5. Click Start; watch countdown advance; click Pause/Resume; type a message → "Send"; speaker view at `/r/<accessCode>/speaker` (open in another tab) reflects everything.

- [ ] **Step 3: Commit**

```bash
git add src/web && git commit -m "feat(web): sign-out button on events page; manual smoke checklist verified"
```

---

## Spec coverage map

| Spec section | Where implemented |
|---|---|
| §4.1 Control panel — minimal slice | T6 (events list), T10–T11 (single-room control) |
| §4.1 Control panel — full schedule editor | Plan 3 |
| §4.2 Speaker view (Layout A) | T9 |
| §4.3 Door view, §4.4 Lobby view | Plan 3 |
| §4.5 Live controls | T10 (transport), T11 (adjustments + messages) |
| §6.3 Client-side display computation | T7 (helpers), T9 (Countdown component) |
| §6.4 Snapshot payload | T2 (DTO), T8 (consume in hook) |
| §10 Branding (theme tokens + logo) | Plan 4 — defaults wired in T1, override mechanism deferred |
| §11 Public access codes URL parsing | T9 (SpeakerView normalises dash-stripped) |
| §12 Container packaging | Plan 5 |

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-10-speaker-and-control.md`.
