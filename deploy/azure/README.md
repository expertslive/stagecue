# Azure deployment runbook

Deploy Event Stage Timer to Azure Container Apps with Azure SQL Database and Azure Blob Storage.

## One-time setup

```bash
# 1. Create resource group + Azure Container Registry
RG=est-rg
LOCATION=westeurope
ACR=estregistry$RANDOM

az group create -n $RG -l $LOCATION
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true

# 2. Build + push the image (multi-arch on Azure-side build)
az acr build -r $ACR -t eventstagetimer:1.0 .
```

## Deploy infrastructure (Bicep)

```bash
APP_NAME=est-app
ADMIN_PASSWORD="$(openssl rand -base64 24)"
SQL_SERVER=est-sql-$RANDOM
SQL_DB=EventStageTimer
STORAGE_ACCOUNT=eststg$RANDOM

az deployment group create \
  --resource-group $RG \
  --template-file deploy/azure/main.bicep \
  --parameters \
    appName=$APP_NAME \
    acrName=$ACR \
    imageTag=1.0 \
    sqlServerName=$SQL_SERVER \
    sqlDatabaseName=$SQL_DB \
    sqlAdminPassword="$ADMIN_PASSWORD" \
    storageAccountName=$STORAGE_ACCOUNT
```

## Configure environment on first deploy

Set these on the Container App (env vars or secrets):

| Name | Value |
|---|---|
| `ConnectionStrings__Default` | `Server=tcp:<sqlserver>.database.windows.net,1433;Database=EventStageTimer;User ID=<admin>;Password=<...>;Encrypt=true;TrustServerCertificate=false` |
| `Storage__Mode` | `AzureBlob` |
| `Storage__AzureBlob__ConnectionString` | (storage account connection string) |
| `Storage__AzureBlob__Container` | `uploads` |
| `Auth__Mode` | `MagicLink` |
| `Smtp__Host` / `Smtp__Port` / `Smtp__Username` / `Smtp__Password` / `Smtp__FromAddress` | (SMTP provider — Azure Communication Services or SendGrid) |
| `App__BaseUrl` | `https://<your-domain>` |
| `Database__AutoMigrate` | `true` for the **first** deploy only; set to `false` afterward and run migrations explicitly |

## Custom domain + TLS

```bash
az containerapp hostname add \
  -g $RG -n $APP_NAME --hostname timer.example.com
az containerapp hostname bind \
  -g $RG -n $APP_NAME --hostname timer.example.com --validation-method CNAME
# After CNAME validation:
az containerapp ssl upload \
  -g $RG -n $APP_NAME --hostname timer.example.com --certificate-file cert.pfx
```

## Operations

- **Scale:** Container Apps auto-scales on HTTP concurrency. Keep `min-replicas=1` so the SignalR hub stays warm.
- **SQL:** Azure SQL Hyperscale or Business Critical for production traffic.
- **Migrations:** After first deploy, set `Database:AutoMigrate=false`. Run new migrations through CI: `dotnet ef migrations script` against the prod connection string, review, then apply.
- **Logs:** `az containerapp logs show -g $RG -n $APP_NAME --follow`.
- **Backups:** Azure SQL has built-in PITR; Blob Storage has soft-delete (configure on the storage account).
