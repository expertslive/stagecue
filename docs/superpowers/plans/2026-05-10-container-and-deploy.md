# Container Packaging + Azure Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the kernel as a single self-contained Docker image that builds the React SPA, the .NET API, and serves both from one container. Provide a `docker-compose.yml` for self-host (`app` + `sqlserver`), an `AzureBlobStorage` implementation of `IFileStorage` selected via `Storage:Mode` config, a production `appsettings.Production.json` with safe defaults, and runbook docs for deploying to Azure Container Apps with Azure SQL Database + Azure Blob Storage.

**Architecture:** A single multi-stage Dockerfile: stage 1 (`node:lts-alpine`) builds `src/web` to a `dist/` directory; stage 2 (`mcr.microsoft.com/dotnet/sdk:10.0`) restores + publishes the API and copies the SPA `dist/` into `wwwroot/`; stage 3 (`mcr.microsoft.com/dotnet/aspnet:10.0`) is the runtime image (port 8080, non-root user). `AzureBlobStorage` implements `IFileStorage` using `Azure.Storage.Blobs` and is selected when `Storage:Mode=AzureBlob`; otherwise `LocalFileStorage` (the default) writes to a mounted volume.

**Tech Stack additions:** `Azure.Storage.Blobs` (already in `Directory.Packages.props`), Docker, optionally Azure CLI. No new app dependencies.

**Spec reference:** §12 Container, deployment, configuration; §10 Branding (logo storage portability).

---

## File structure

```
Dockerfile
.dockerignore
docker-compose.yml
deploy/
  azure/
    README.md
    deploy.sh                       # az CLI commands

src/EventStageTimer.Infrastructure/Storage/
  AzureBlobStorage.cs               # T2

src/EventStageTimer.Api/
  appsettings.Production.json       # T3
  Program.cs                        # T3 (Storage:Mode dispatch)
```

---

## Task 1: Dockerfile + .dockerignore

- [ ] **Step 1: `.dockerignore`**

```
**/bin/
**/obj/
**/node_modules/
**/dist/
src/EventStageTimer.Api/wwwroot/*
!src/EventStageTimer.Api/wwwroot/.gitkeep

.git
.vs
.vscode
.idea
*.user
*.suo

docs/superpowers/.superpowers/
.superpowers/
.DS_Store
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

# ----- Stage 1: Build the React SPA -----
FROM node:22-alpine AS web
WORKDIR /src
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci
COPY src/web/ ./
RUN npm run build

# ----- Stage 2: Restore + publish the .NET API -----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet
WORKDIR /src

# Copy solution + central package management
COPY EventStageTimer.sln Directory.Packages.props global.json ./
COPY src/EventStageTimer.Domain/EventStageTimer.Domain.csproj         src/EventStageTimer.Domain/
COPY src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj src/EventStageTimer.Infrastructure/
COPY src/EventStageTimer.Api/EventStageTimer.Api.csproj               src/EventStageTimer.Api/
COPY tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj tests/EventStageTimer.Domain.Tests/
COPY tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj  tests/EventStageTimer.Api.Tests/
RUN dotnet restore EventStageTimer.sln

# Copy the rest of the source
COPY . .

# Drop the SPA built in stage 1 into wwwroot before publishing
RUN rm -rf src/EventStageTimer.Api/wwwroot && mkdir -p src/EventStageTimer.Api/wwwroot
COPY --from=web /src/../EventStageTimer.Api/wwwroot/ src/EventStageTimer.Api/wwwroot/

# (vite is configured to write to ../EventStageTimer.Api/wwwroot — but in this multi-stage build
#  the `npm run build` of stage 1 wrote into a parallel layer. Re-run the build path here:)
COPY --from=web /src/dist src/EventStageTimer.Api/wwwroot

RUN dotnet publish src/EventStageTimer.Api/EventStageTimer.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

# ----- Stage 3: Runtime image -----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=dotnet /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV Storage__Local__Root=/app/uploads
EXPOSE 8080

# Non-root user
RUN useradd --uid 10001 --create-home --shell /bin/bash app && \
    mkdir -p /app/uploads && chown -R app:app /app /app/uploads
USER app

ENTRYPOINT ["dotnet", "EventStageTimer.Api.dll"]
```

> Note on the `vite` output path: `vite.config.ts` builds to `../EventStageTimer.Api/wwwroot`. When stage 1 has only `src/web/` copied (not the rest of the repo), the build writes to a path that *would* exist at `/src/../EventStageTimer.Api/wwwroot/`. We update vite to also accept a `WEB_OUT` env override OR change the build to a local `dist/` and copy explicitly. The cleanest fix: change `vite.config.ts` to default `outDir: "dist"` (local) and add a separate npm script `build:wwwroot` for local dev that copies into the API. The Dockerfile then uses `--from=web /src/dist`.

- [ ] **Step 3: Update `vite.config.ts` so Docker builds work cleanly**

Change `build.outDir` to `"dist"` (default Vite behavior) so stage 1 produces `/src/dist`. Provide `npm run build:web` (alias) but keep `npm run build` for both purposes; the dev workflow uses a separate `npm run sync` script (or just `cp -r dist ../EventStageTimer.Api/wwwroot`).

Edit `src/web/vite.config.ts`:

```ts
build: {
  outDir: "dist",
  emptyOutDir: true,
},
```

Edit `src/web/package.json` scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "sync-wwwroot": "rm -rf ../EventStageTimer.Api/wwwroot && mkdir -p ../EventStageTimer.Api/wwwroot && cp -r dist/* ../EventStageTimer.Api/wwwroot/",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest"
}
```

Local dev now: `npm run build && npm run sync-wwwroot`. The Dockerfile uses `--from=web /src/dist` directly.

- [ ] **Step 4: Verify the image builds**

```bash
docker build -t eventstagetimer:dev .
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore src/web
git commit -m "feat(deploy): multi-stage Dockerfile + dockerignore"
```

---

## Task 2: `AzureBlobStorage`

- [ ] **Step 1: Implement**

```csharp
// src/EventStageTimer.Infrastructure/Storage/AzureBlobStorage.cs
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Options;

namespace EventStageTimer.Infrastructure.Storage;

public sealed class AzureBlobStorageOptions
{
    public string ConnectionString { get; set; } = "";
    public string Container { get; set; } = "uploads";
}

public sealed class AzureBlobStorage : IFileStorage
{
    private readonly BlobContainerClient _container;

    public AzureBlobStorage(IOptions<AzureBlobStorageOptions> opts)
    {
        var o = opts.Value;
        if (string.IsNullOrWhiteSpace(o.ConnectionString))
            throw new InvalidOperationException("Storage:AzureBlob:ConnectionString is required");
        _container = new BlobContainerClient(o.ConnectionString, o.Container);
        _container.CreateIfNotExists(PublicAccessType.None);
    }

    public async Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct)
    {
        var key = $"{Guid.NewGuid():N}{ExtFor(contentType)}";
        var blob = _container.GetBlobClient(key);
        await blob.UploadAsync(content, new BlobHttpHeaders { ContentType = contentType }, cancellationToken: ct);
        return key;
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(key);
        if (!await blob.ExistsAsync(ct)) return null;
        var resp = await blob.DownloadContentAsync(ct);
        var stream = resp.Value.Content.ToStream();
        var ctype = resp.Value.Details.ContentType ?? "application/octet-stream";
        return (stream, ctype);
    }

    public async Task DeleteAsync(string key, CancellationToken ct)
    {
        await _container.GetBlobClient(key).DeleteIfExistsAsync(cancellationToken: ct);
    }

    private static string ExtFor(string ct) => ct switch
    {
        "image/png" => ".png",
        "image/svg+xml" => ".svg",
        "image/jpeg" => ".jpg",
        _ => "",
    };
}
```

- [ ] **Step 2: Add Azure.Storage.Blobs reference to Infrastructure**

```bash
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package Azure.Storage.Blobs
```

- [ ] **Step 3: Switch storage based on `Storage:Mode` in Program.cs**

```csharp
// File storage — Local (default) or AzureBlob (production)
builder.Services.Configure<EventStageTimer.Infrastructure.Storage.LocalFileStorageOptions>(builder.Configuration.GetSection("Storage:Local"));
builder.Services.Configure<EventStageTimer.Infrastructure.Storage.AzureBlobStorageOptions>(builder.Configuration.GetSection("Storage:AzureBlob"));
var storageMode = builder.Configuration["Storage:Mode"] ?? "Local";
if (string.Equals(storageMode, "AzureBlob", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Storage.IFileStorage, EventStageTimer.Infrastructure.Storage.AzureBlobStorage>();
else
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Storage.IFileStorage, EventStageTimer.Infrastructure.Storage.LocalFileStorage>();
```

- [ ] **Step 4: Build + commit**

---

## Task 3: `appsettings.Production.json` + config sketch

- [ ] **Step 1: Create production defaults**

```json
{
  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } },
  "Database": { "AutoMigrate": false },
  "Storage": { "Mode": "AzureBlob" },
  "Auth": { "Mode": "MagicLink" }
}
```

(`ConnectionStrings:Default`, `Storage:AzureBlob:ConnectionString`, `Smtp:*`, and `App:BaseUrl` are expected from environment variables — `__` separator maps to colon, e.g. `Storage__AzureBlob__ConnectionString`.)

---

## Task 4: `docker-compose.yml` for self-host

```yaml
services:
  app:
    image: eventstagetimer:dev
    build: .
    ports:
      - "8080:8080"
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__Default: "Server=db,1433;Database=EventStageTimer;User Id=sa;Password=${SA_PASSWORD:-Your_strong_password_123};TrustServerCertificate=true"
      Database__AutoMigrate: "true"
      Storage__Mode: "Local"
      Storage__Local__Root: "/app/uploads"
      App__BaseUrl: "${APP_BASE_URL:-http://localhost:8080}"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - uploads:/app/uploads

  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "${SA_PASSWORD:-Your_strong_password_123}"
    ports:
      - "1433:1433"
    volumes:
      - sqldata:/var/opt/mssql
    healthcheck:
      test: /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$$MSSQL_SA_PASSWORD" -No -Q "SELECT 1" || exit 1
      interval: 10s
      retries: 12
      start_period: 30s

volumes:
  uploads:
  sqldata:
```

`docker compose up --build` and the stack runs at `http://localhost:8080`. Use `--seed` once via `docker compose run --rm app dotnet EventStageTimer.Api.dll --seed`.

---

## Task 5: Azure runbook + bicep skeleton

- [ ] **Step 1: Provide a deploy script and bicep template**

`deploy/azure/main.bicep` — minimal skeleton: resource group, Container Apps environment + Container App, Azure SQL server + database, Storage account + container, App Insights.

`deploy/azure/deploy.sh` — `az` CLI commands wrapped in env-var prompts.

`deploy/azure/README.md` — checklist:
1. Build + push image to ACR (`az acr build -t eventstagetimer:1.0 -r myacr .`)
2. Create resource group, deploy bicep with parameters
3. Set environment variables on the Container App (connection strings, SMTP)
4. Trigger initial migration once (`Database:AutoMigrate=true` for first deploy, then disable)
5. Configure custom domain + TLS

(Detailed bicep is non-trivial — outline-only for v1; implementer fills in resource definitions from current Azure provider versions.)

---

## Task 6: README updates + smoke

- [ ] **Step 1: Update README with deploy instructions**

Add a `## Deploying` section explaining `docker compose up --build`, the `--seed` step, and a pointer to `deploy/azure/`.

- [ ] **Step 2: Smoke test**

```bash
docker compose up --build -d
sleep 30  # SQL Server takes ~20s to be ready
docker compose run --rm app dotnet EventStageTimer.Api.dll --seed
curl -sf http://localhost:8080/health
curl -sf http://localhost:8080/ | grep -q "Event Stage Timer"
docker compose down -v
```

- [ ] **Step 3: Final commit + PROGRESS update**

---

## Spec coverage map

| Spec section | Where implemented |
|---|---|
| §12.1 Image | T1 |
| §12.2 Compose stack | T4 |
| §12.3 Azure deployment | T5 (skeleton + runbook) |
| §12.4 Configuration matrix | T2 (Storage:Mode) + T3 (appsettings.Production.json) |
| §10 Branding storage portability | T2 (AzureBlobStorage) |
