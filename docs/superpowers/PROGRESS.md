# Execution Progress

**Spec:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md`

## Plans

| # | Plan | Status |
|---|---|---|
| 1 | `2026-05-10-backend-kernel.md` | ✅ Complete — 43/43 tests pass |
| 2 | `2026-05-10-speaker-and-control.md` | ✅ Complete — 7/7 web unit tests, smoke verified |
| 3 | `2026-05-10-schedule-and-audience-views.md` | ✅ Complete — schedule editor (drag-drop), door view, lobby view, message templates, /info endpoints |
| 4 | Branding + members + invitations + audit | Not started |
| 5 | Container packaging + Azure deployment | Not started |

## Smoke (Plan 2 verification, 2026-05-10)

```bash
docker run -d -p 1433:1433 --name est-sql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 mcr.microsoft.com/mssql/server:2022-latest
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --seed
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
```

Verified responding:
- `GET /health` → `{"status":"ok"}`
- `GET /` → serves the SPA index.html (Vite-built)
- `GET /r/WAQQ-76DB/ping` → resolves the seeded access code; returns `{"roomId":"…","eventId":"…"}` through the `PublicAccessCode` auth scheme

## Five Plan-1 corrections (verified by tests)

1. FK cascade cycle on EventMembershipRoom/InvitationRoom→Room: `OnDelete(DeleteBehavior.Restrict)`
2. `app.UseRouting()` must run before `UseAuthentication()` so authz handlers see route values
3. `EventAccessHandler` falls back to `roomId → eventId` for `ScheduleItemsController`
4. `EnableRetryOnFailure` forbids user-initiated transactions — `StartItemAsync`/`SkipNextAsync` use `CreateExecutionStrategy().ExecuteAsync(...)`
5. SQL `rowversion` bumps on any UPDATE — switched `RoomTimerState.Version` to manual `long` incremented only on state-changing commands; verified by `MessageVersioningTests`

Plus: replaced multi-tenant query-filter closure with `AppDbContext.CurrentTenantId` property so EF parameterizes per query.

## Plan-2 lessons

- `npm create vite@latest` in May 2026 produces TypeScript with `erasableSyntaxOnly: true` enabled; parameter properties (`constructor(public x: T)`) are not allowed. Use explicit fields + assignment.
- Vite 8 + Vitest 2 had a `ProxyOptions` type mismatch; vitest@latest (3.x) resolved it.
- TypeScript 7.x deprecates `baseUrl` for path mapping; `paths` works without it (relative to tsconfig).
- `@testing-library/jest-dom` requires `globals: true` in vitest config (it calls top-level `expect.extend`).
- `vite.config.ts` should `import { defineConfig } from "vitest/config"` when adding a `test` block, not from `vite`.

## Known issues

- Transitive vulnerabilities (no upstream fix yet):
  - `System.Security.Cryptography.Xml` (`GHSA-37gx-xxp4-5rgx`, `GHSA-w3x6-4m5h-cxqf`)
  - `MimeKit` 4.8.0 (`GHSA-g7hc-96xr-gvvx`)
- macOS arm64 + the `mcr.microsoft.com/mssql/server:2022-latest` linux/amd64 image runs under emulation. First boot needs ~10–20 seconds before connections succeed.

## How to run

```bash
# 1. Backend prereqs
docker run -d -p 1433:1433 --name est-sql \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 \
  mcr.microsoft.com/mssql/server:2022-latest

# 2. Build the SPA into wwwroot
(cd src/web && npm install && npm run build)

# 3. Bootstrap demo data once
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --seed

# 4. Run combined API + SPA
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
```

Visit `http://localhost:5050/`. Sign in with `owner@local` / `Strong_Pwd_123`. Open the seeded room and a speaker tab at `/r/<accessCode>/speaker` (the seed prints the code).

## Tests

```bash
# .NET (43 tests; integration tests need Docker)
dotnet test

# Web (7 unit tests)
(cd src/web && npm test -- --run)
```
