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

# Copy the SPA build into wwwroot before publishing
RUN rm -rf src/EventStageTimer.Api/wwwroot
COPY --from=web /src/dist src/EventStageTimer.Api/wwwroot

RUN dotnet publish src/EventStageTimer.Api/EventStageTimer.Api.csproj \
    -c Release -o /app/publish --no-restore /p:UseAppHost=false

# ----- Stage 3: Runtime image -----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=dotnet /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
ENV Storage__Local__Root=/app/uploads
EXPOSE 8080

# Use the non-root `app` user from the base image
RUN mkdir -p /app/uploads && chown -R app:app /app /app/uploads
USER app

ENTRYPOINT ["dotnet", "EventStageTimer.Api.dll"]
