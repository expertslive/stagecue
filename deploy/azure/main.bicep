// Skeleton bicep for Event Stage Timer on Azure Container Apps + Azure SQL + Storage.
// Fills in only the moving parts; see deploy/azure/README.md for the full runbook.

param appName string
param location string = resourceGroup().location
param acrName string
param imageTag string = 'latest'
param sqlServerName string
param sqlDatabaseName string = 'EventStageTimer'
param sqlAdminLogin string = 'estadmin'
@secure()
param sqlAdminPassword string
param storageAccountName string
param logAnalyticsName string = '${appName}-logs'
param environmentName string = '${appName}-env'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource log 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${appName}-ai'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: log.id
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: log.properties.customerId
        sharedKey: log.listKeys().primarySharedKey
      }
    }
  }
}

resource sql 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  name: sqlDatabaseName
  parent: sql
  location: location
  sku: { name: 'GP_S_Gen5_2', tier: 'GeneralPurpose' }
  properties: { autoPauseDelay: 60, minCapacity: json('0.5'), maxSizeBytes: 32212254720 }
}

resource sqlFw 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  name: 'AllowAzureServices'
  parent: sql
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2' }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 8080, transport: 'auto' }
      registries: [{ server: '${acr.name}.azurecr.io', username: acr.name, passwordSecretRef: 'acr-pwd' }]
      secrets: [
        { name: 'acr-pwd', value: acr.listCredentials().passwords[0].value }
        { name: 'sql-conn', value: 'Server=tcp:${sql.properties.fullyQualifiedDomainName},1433;Database=${sqlDatabaseName};User ID=${sqlAdminLogin};Password=${sqlAdminPassword};Encrypt=true;TrustServerCertificate=false' }
        { name: 'storage-conn', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
      ]
    }
    template: {
      containers: [{
        name: 'app'
        image: '${acr.name}.azurecr.io/eventstagetimer:${imageTag}'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
          { name: 'ConnectionStrings__Default', secretRef: 'sql-conn' }
          { name: 'Database__AutoMigrate', value: 'true' }
          { name: 'Storage__Mode', value: 'AzureBlob' }
          { name: 'Storage__AzureBlob__ConnectionString', secretRef: 'storage-conn' }
          { name: 'Storage__AzureBlob__Container', value: 'uploads' }
          { name: 'Auth__Mode', value: 'MagicLink' }
          { name: 'ApplicationInsights__ConnectionString', value: appInsights.properties.ConnectionString }
        ]
        probes: [
          { type: 'Liveness', httpGet: { path: '/health/live', port: 8080 }, periodSeconds: 30, failureThreshold: 3 }
          { type: 'Readiness', httpGet: { path: '/health/ready', port: 8080 }, periodSeconds: 10, failureThreshold: 3, initialDelaySeconds: 15 }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

output appUrl string = containerApp.properties.configuration.ingress.fqdn
