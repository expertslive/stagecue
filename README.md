# Stagecue

Multi-tenant SaaS-default event stage timer with self-host support. ASP.NET Core 10 + SignalR backend, React 19 + Vite frontend, SQL Server.

> Internal C# namespaces are still `EventStageTimer.*` from the original working title; renaming will be done as a separate, mechanical PR.

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

## Run an event from a laptop (offline self-host)

The `docker-compose.yml` is the operator runbook for venue-day:

```bash
# 1. Configure once per laptop / event
cp .env.example .env
# Edit .env: set SA_PASSWORD to something strong and APP_BASE_URL to the
# laptop's LAN IP so tablets and confidence monitors on the same Wi-Fi can
# reach it (e.g. http://192.168.0.10:8080).

# 2. Build + start
docker compose up --build -d

# 3. First time only — bootstrap the tenant + admin user.
#    Either complete the /setup wizard in the browser, OR seed demo data:
docker compose run --rm app dotnet EventStageTimer.Api.dll --seed
# Note the printed access codes — those are what you'll print on QR codes.

# 4. Open the control panel
open http://localhost:8080      # or http://<your LAN IP>:8080

# 5. Public URLs to hand to confidence monitors / door tablets / lobby screens:
#    http://<laptop-ip>:8080/r/XXXX-XXXX/speaker        (per room)
#    http://<laptop-ip>:8080/r/XXXX-XXXX/door           (per room — door display)
#    http://<laptop-ip>:8080/e/YYYY-YYYY/lobby          (event-wide lobby)

# Stop between sessions (data is preserved on the named volumes):
docker compose stop

# Wipe everything and start fresh:
docker compose down -v
```

Operational notes:

- Uploads (logos) live in the `uploads` Docker volume; SQL data lives in `sqldata`. Both survive `docker compose stop` and `docker compose up`.
- Auth defaults to **password mode** — SMTP is not required at the venue. (`Auth__Mode: Password` in `docker-compose.yml`.)
- Storage defaults to **Local** (filesystem inside the container) — no Azure dependency. (`Storage__Mode: Local`.)
- Scheduler and SignalR hub run in-process — no Redis backplane needed for a single-laptop event.
- Health probes: `GET /health/live` (process up) and `GET /health/ready` (DB reachable).
- macOS / Apple Silicon: the SQL Server image is linux/amd64 and runs under emulation; first start takes ~30s.

## Run locally without Docker (dev workflow)

Prereqs: .NET 10 SDK, Node 22+, Docker (for SQL Server only).

```bash
# 1. Start SQL Server
docker run -d -p 1433:1433 --name stagecue-sql \
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

Or run Vite dev mode for hot-reload (proxies `/api`, `/hub`, `/r/{code}/{info,branding,ping}`, `/e/{code}/{info,branding}` to the .NET API):

```bash
# Terminal 1: API
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050
# Terminal 2: Vite at http://localhost:5173
cd src/web && npm run dev
```

## Tests

```bash
# Backend — 81 tests (27 domain unit, 54 integration via Testcontainers). Needs Docker.
dotnet test

# Frontend — 11 unit tests (Vitest)
(cd src/web && npm test -- --run)
```

## Deploying to Azure

See `deploy/azure/README.md`. In short:

```bash
export RG=stagecue-rg ACR=stagecueregistry$RANDOM SQL_SERVER=stagecue-sql-$RANDOM \
       SQL_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
       STORAGE_ACCOUNT=stagecuestg$RANDOM
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

## License

Licensed under the [MIT License](LICENSE). Use it, modify it, ship it — commercial or not. No warranty.

## Known issues

- Transitive `System.Security.Cryptography.Xml` carries `GHSA-37gx-xxp4-5rgx` and `GHSA-w3x6-4m5h-cxqf` advisories at all current versions through 10.0.0. No patched version available yet. Pinning does not help.
- `MimeKit` 4.8.0 (transitive of `MailKit`) carries `GHSA-g7hc-96xr-gvvx` (moderate). Will revisit when `MailKit` updates.
- macOS arm64 + the `mcr.microsoft.com/mssql/server:2022-latest` linux/amd64 image runs under emulation. First boot needs ~10–20 seconds before connections succeed.
