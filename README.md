# Event Stage Timer

Multi-tenant SaaS-default event stage timer with self-host support. ASP.NET Core 10 + SignalR backend, React 19 + Vite frontend (added in later plans), SQL Server.

## Status

This repository currently contains the **backend kernel** — the server-side foundation including data model, auth, tenancy, the timer state machine, the SignalR hub, the auto-start scheduler, public access codes with rate limiting, and a comprehensive integration test suite. No UI yet.

See `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md` for the full design.

## Running locally

Prereqs: .NET 10 SDK, Docker.

```bash
# Start a SQL Server container
docker run -d -p 1433:1433 --name est-sql \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 \
  mcr.microsoft.com/mssql/server:2022-latest

# One-shot seed for an empty DB (creates a Demo tenant, owner, event, room, and item)
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --seed

# Normal run on http://localhost:5050
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
```

Endpoints:

- `GET /health` — health probe
- `POST /api/setup/initialize` — first-run bootstrap (self-host)
- `POST /api/auth/password/signin` — password sign-in
- `POST /api/auth/magic-link/request` — request magic link (SaaS, requires SMTP)
- `GET /api/auth/magic-link/consume?token=…` — magic link sign-in
- `GET|POST|PUT|DELETE /api/events[/{id}]` — events CRUD
- `… /api/events/{eventId}/rooms[/{id}]` — rooms CRUD + `POST .../regenerate-access-code`
- `… /api/rooms/{roomId}/schedule[/{id}]` — schedule items + `POST .../reorder`
- `WS /hub/timer` — SignalR hub (cookie auth for operators, `?code=XXXX-XXXX` for public clients)

## Tests

```bash
dotnet test
```

Integration tests (`EventStageTimer.Api.Tests`) use Testcontainers — Docker must be running. Domain tests are pure unit and require nothing.

## Project layout

```
src/
  EventStageTimer.Domain/          # Entities, timer state machine, command types — no infra deps
  EventStageTimer.Infrastructure/  # EF Core DbContext, email senders, file storage, code generator
  EventStageTimer.Api/             # ASP.NET Core host (controllers, hub, auth, middleware, scheduler)
tests/
  EventStageTimer.Domain.Tests/    # Pure unit tests (TDD)
  EventStageTimer.Api.Tests/       # Integration tests via WebApplicationFactory + Testcontainers
docs/
  superpowers/
    specs/                          # Design specs
    plans/                          # Implementation plans
    PROGRESS.md                     # Plan execution checkpoint
```

## Known issues

- Transitive `System.Security.Cryptography.Xml` carries `GHSA-37gx-xxp4-5rgx` and `GHSA-w3x6-4m5h-cxqf` advisories at all current versions through 10.0.0 — no patched version is available yet. Pinning does not help. Tracked.
- `MimeKit` 4.8.0 (transitive of `MailKit`) carries `GHSA-g7hc-96xr-gvvx` (moderate). Will revisit when `MailKit` updates.
