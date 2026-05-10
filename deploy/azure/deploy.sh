#!/usr/bin/env bash
# Convenience wrapper for the Azure deploy. See deploy/azure/README.md for context.
set -euo pipefail

: "${RG:?RG is required (e.g. RG=est-rg)}"
: "${LOCATION:=westeurope}"
: "${APP_NAME:=est-app}"
: "${ACR:?ACR registry name is required}"
: "${IMAGE_TAG:=latest}"
: "${SQL_SERVER:?SQL_SERVER is required (must be globally unique)}"
: "${SQL_DB:=EventStageTimer}"
: "${SQL_ADMIN_LOGIN:=estadmin}"
: "${SQL_ADMIN_PASSWORD:?SQL_ADMIN_PASSWORD is required}"
: "${STORAGE_ACCOUNT:?STORAGE_ACCOUNT is required (must be globally unique, lowercase)}"

az group create -n "$RG" -l "$LOCATION" --output none
az acr build -r "$ACR" -t "eventstagetimer:$IMAGE_TAG" .

az deployment group create \
  --resource-group "$RG" \
  --template-file "$(dirname "$0")/main.bicep" \
  --parameters \
    appName="$APP_NAME" \
    acrName="$ACR" \
    imageTag="$IMAGE_TAG" \
    sqlServerName="$SQL_SERVER" \
    sqlDatabaseName="$SQL_DB" \
    sqlAdminLogin="$SQL_ADMIN_LOGIN" \
    sqlAdminPassword="$SQL_ADMIN_PASSWORD" \
    storageAccountName="$STORAGE_ACCOUNT"

echo "Deployed. Hit https://$(az containerapp show -g "$RG" -n "$APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)/"
