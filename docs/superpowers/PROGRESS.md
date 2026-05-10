# Backend Kernel — Execution Progress

**Plan:** `docs/superpowers/plans/2026-05-10-backend-kernel.md`
**Spec:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md`
**Status:** ✅ COMPLETE — all 57 plan tasks executed, 43/43 tests pass.

## Test results

- **Domain.Tests:** 27 passed, 0 failed
- **Api.Tests:** 16 passed, 0 failed (Testcontainers SQL Server 2022)
- **Total:** 43/43 passing

## Five fixes uncovered while running tests (after the plan was written)

1. **FK cascade cycle** — `OnDelete(DeleteBehavior.Restrict)` on EventMembershipRoom→Room and InvitationRoom→Room edges to break the cascade path through Event→Room→Join.
2. **`UseRouting()` ordering** — added explicit `app.UseRouting()` before `UseAuthentication()` so authorization handlers can read route values.
3. **EventAccessHandler roomId fallback** — `ScheduleItemsController` route only carries `roomId`; the handler now resolves `roomId → eventId` so policies still work.
4. **Execution strategy + transactions** — `EnableRetryOnFailure` forbids user-initiated transactions; `StartItemAsync` and `SkipNextAsync` now wrap their transactions in `db.Database.CreateExecutionStrategy().ExecuteAsync(…)`.
5. **Version semantics** — the plan claimed `ExecuteUpdateAsync` avoids rowversion bumping. SQL Server actually bumps `rowversion` on any UPDATE regardless. Switched `RoomTimerState.Version` from `byte[]` rowversion to a manually-incremented `long`. State-changing commands increment; `SetMessage` does not — verified by `MessageVersioningTests`.

Plus a structural fix to the multi-tenant query filter: EF caches the compiled filter expression at model-build time, so a closure over `() => _ctx.TenantId` was evaluated once, not per query. Replaced with `AppDbContext.CurrentTenantId` property — EF parameterizes it per query. Verified by `TenantIsolationTests`.

## Known issues / decisions

- **Transitive vulnerabilities** (no upstream fixes available):
  - `System.Security.Cryptography.Xml` — `GHSA-37gx-xxp4-5rgx`, `GHSA-w3x6-4m5h-cxqf` (high)
  - `MimeKit` 4.8.0 (via MailKit) — `GHSA-g7hc-96xr-gvvx` (moderate)
- **`coverlet.collector`** retained in central pinning (auto-added by xUnit templates).
- **Two EF query-filter warnings** about `EventMembershipRoom`/`InvitationRoom` lacking filters while parents have them. Not breaking — the join tables are only accessed via authorized policies that explicitly use `IgnoreQueryFilters()`.

## How to run

Prereqs: .NET 10 SDK, Docker.

```bash
# Start a SQL Server container
docker run -d -p 1433:1433 --name est-sql \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 \
  mcr.microsoft.com/mssql/server:2022-latest

# Bootstrap a demo dataset
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --seed

# Normal run
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050

# Tests (Docker required for integration tests)
dotnet test
```

## Next plans

- **Plan 2:** Speaker view + minimal control panel (React 19 + Vite + Tailwind + shadcn/ui + @microsoft/signalr)
- **Plan 3:** Schedule editor with drag-drop, door view, lobby view, message templates UI
- **Plan 4:** Branding + members + invitations + audit log UI
- **Plan 5:** Container packaging + Azure deployment

The backend kernel exposes:

- REST: `/api/events[/{id}]`, `/api/events/{id}/rooms[/{id}]`, `/api/rooms/{id}/schedule[/{id}]`, `/api/auth/{password|magic-link}/...`, `/api/setup/...`
- SignalR: `/hub/timer` with cookie auth (operators) and `?code=…` access-code auth (public)
- Public probe: `/r/{code}/ping` (will be replaced by real branding/snapshot endpoints in Plan 4)
