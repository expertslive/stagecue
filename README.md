# Event Stage Timer

Multi-tenant SaaS-default event stage timer with self-host support. ASP.NET Core 10 + SignalR backend, React 19 + Vite frontend, SQL Server.

## Status

All five plans (backend kernel · speaker view + control · schedule editor + audience views · branding + members + audit · container packaging + Azure) are complete. End-to-end stack runs as a single Docker image.

See `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md` for the full design and `docs/superpowers/PROGRESS.md` for the rollup.

## Run locally with Docker Compose (recommended)

Prereq: Docker.

```bash
docker compose up --build -d
# Wait ~30s for SQL Server to be ready, then seed once:
docker compose run --rm app dotnet EventStageTimer.Api.dll --seed
# Browse:
open http://localhost:8080
```

Sign in with `owner@local` / `Strong_Pwd_123`. Open the seeded room and a speaker tab at `/r/<accessCode>/speaker` (the seed prints the code).

`docker compose down -v` resets the database and uploads.

## Run locally without Docker (dev workflow)

Prereqs: .NET 10 SDK, Node 22+, Docker (for SQL Server only).

```bash
# 1. Start SQL Server
docker run -d -p 1433:1433 --name est-sql \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 \
  mcr.microsoft.com/mssql/server:2022-latest

# 2. Build the SPA (also copies it into the API's wwwroot)
cd src/web && npm install && npm run build && npm run sync-wwwroot && cd ../..

# 3. Seed once
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --seed

# 4. Run combined API + SPA on http://localhost:5050
ASPNETCORE_ENVIRONMENT=Development \
  dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
```

Or run Vite dev mode for hot-reload (proxies `/api`, `/hub`, `/r`, `/e` to the .NET API):

```bash
# Terminal 1: API
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
# Terminal 2: Vite at http://localhost:5173
cd src/web && npm run dev
```

## Tests

```bash
# Backend (44 tests; integration tests need Docker)
dotnet test

# Frontend (7 unit tests)
(cd src/web && npm test -- --run)
```

## Deploying to Azure

See `deploy/azure/README.md`. In short:

```bash
export RG=est-rg ACR=estregistry$RANDOM SQL_SERVER=est-sql-$RANDOM \
       SQL_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
       STORAGE_ACCOUNT=eststg$RANDOM
deploy/azure/deploy.sh
```

The deploy script builds + pushes the image with `az acr build`, then runs the bicep template (`deploy/azure/main.bicep`) which provisions Container Apps environment, the app, Azure SQL Database (Hyperscale-eligible), Azure Blob Storage, and Log Analytics.

## Project layout

```
src/
  EventStageTimer.Domain/          # Entities, timer state machine, command types — no infra deps
  EventStageTimer.Infrastructure/  # EF Core DbContext, email senders, file storage, code generator
  EventStageTimer.Api/             # ASP.NET Core host (controllers, hub, auth, middleware, scheduler)
  web/                             # React 19 + Vite SPA (built into API's wwwroot)
tests/
  EventStageTimer.Domain.Tests/    # Pure unit tests (TDD)
  EventStageTimer.Api.Tests/       # Integration tests via WebApplicationFactory + Testcontainers
deploy/
  azure/                           # main.bicep, deploy.sh, runbook
docs/
  superpowers/
    specs/                          # Design spec
    plans/                          # 5 implementation plans
    PROGRESS.md                     # Plan execution checkpoint
Dockerfile                         # 3-stage: web → dotnet → runtime
docker-compose.yml                 # self-host with SQL Server + uploads volume
```

## Known issues

- Transitive `System.Security.Cryptography.Xml` carries `GHSA-37gx-xxp4-5rgx` and `GHSA-w3x6-4m5h-cxqf` advisories at all current versions through 10.0.0. No patched version available yet. Pinning does not help.
- `MimeKit` 4.8.0 (transitive of `MailKit`) carries `GHSA-g7hc-96xr-gvvx` (moderate). Will revisit when `MailKit` updates.
- macOS arm64 + the `mcr.microsoft.com/mssql/server:2022-latest` linux/amd64 image runs under emulation. First boot needs ~10–20 seconds before connections succeed.
