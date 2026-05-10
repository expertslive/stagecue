using Azure.Monitor.OpenTelemetry.AspNetCore;
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Serilog;
using Serilog.Events;

// ---------- Serilog bootstrap (catches startup errors before host wiring) ----------
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("App", "EventStageTimer")
    .WriteTo.Console(outputTemplate:
        "{Timestamp:HH:mm:ss.fff} [{Level:u3}] {CorrelationId} {Message:lj}{NewLine}{Exception}")
    .CreateBootstrapLogger();

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((ctx, services, cfg) =>
{
    cfg.MinimumLevel.Information()
        .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
        .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("App", "EventStageTimer")
        .WriteTo.Console(outputTemplate:
            "{Timestamp:HH:mm:ss.fff} [{Level:u3}] {CorrelationId} {Message:lj} {Properties:j}{NewLine}{Exception}");
});

// OpenTelemetry → Azure Monitor when ApplicationInsights:ConnectionString is set
var appInsightsConnString = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrWhiteSpace(appInsightsConnString))
{
    builder.Services.AddOpenTelemetry().UseAzureMonitor(o =>
    {
        o.ConnectionString = appInsightsConnString;
    });
}

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR(o =>
{
    o.EnableDetailedErrors = builder.Environment.IsDevelopment() || builder.Environment.EnvironmentName == "Testing";
});

// Tenancy
builder.Services.AddScoped<ITenantContext, TenantContext>();

// Domain services
builder.Services.AddSingleton<EventStageTimer.Domain.Common.IClock, EventStageTimer.Domain.Common.SystemClock>();
builder.Services.AddScoped<EventStageTimer.Infrastructure.Timer.ITimerCommandService, EventStageTimer.Infrastructure.Timer.TimerCommandService>();
builder.Services.AddScoped<EventStageTimer.Infrastructure.Auth.IAccessCodeGenerator, EventStageTimer.Infrastructure.Auth.AccessCodeGenerator>();

// Email — SMTP if configured, otherwise NoOp
builder.Services.Configure<EventStageTimer.Infrastructure.Email.SmtpOptions>(builder.Configuration.GetSection("Smtp"));
var smtpHost = builder.Configuration["Smtp:Host"];
if (!string.IsNullOrWhiteSpace(smtpHost))
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Email.IEmailSender, EventStageTimer.Infrastructure.Email.SmtpEmailSender>();
else
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Email.IEmailSender, EventStageTimer.Infrastructure.Email.NoOpEmailSender>();

// MagicLink service
builder.Services.AddScoped<EventStageTimer.Api.Auth.MagicLink.MagicLinkService>();

// File storage — Local (default) or AzureBlob (production)
builder.Services.Configure<EventStageTimer.Infrastructure.Storage.LocalFileStorageOptions>(builder.Configuration.GetSection("Storage:Local"));
builder.Services.Configure<EventStageTimer.Infrastructure.Storage.AzureBlobStorageOptions>(builder.Configuration.GetSection("Storage:AzureBlob"));
var storageMode = builder.Configuration["Storage:Mode"] ?? "Local";
if (string.Equals(storageMode, "AzureBlob", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Storage.IFileStorage, EventStageTimer.Infrastructure.Storage.AzureBlobStorage>();
else
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Storage.IFileStorage, EventStageTimer.Infrastructure.Storage.LocalFileStorage>();

// Database
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlServer(
        builder.Configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is required"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

// ASP.NET Core Identity
builder.Services.AddAppIdentity(builder.Configuration);

// Authorization handlers + named policies
builder.Services.AddScoped<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, EventStageTimer.Api.Auth.Policies.EventAccessHandler>();
builder.Services.AddScoped<Microsoft.AspNetCore.Authorization.IAuthorizationHandler, EventStageTimer.Api.Auth.Policies.RoomAccessHandler>();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("EventAdmin", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.EventAccessRequirement(EventStageTimer.Domain.Entities.EventRole.EventAdmin)))
    .AddPolicy("EventViewer", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.EventAccessRequirement(EventStageTimer.Domain.Entities.EventRole.Viewer)))
    .AddPolicy("RoomOperator", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.RoomAccessRequirement(EventStageTimer.Domain.Entities.EventRole.RoomOperator)));

// Public rate limiting
builder.Services.Configure<EventStageTimer.Api.Middleware.PublicRateLimitOptions>(builder.Configuration.GetSection("Security:PublicRateLimit"));

// Audit + background services
builder.Services.AddScoped<EventStageTimer.Api.Audit.IAuditWriter, EventStageTimer.Api.Audit.AuditWriter>();
builder.Services.AddHostedService<EventStageTimer.Api.BackgroundServices.SchedulerService>();

// Health checks
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>("database", failureStatus: HealthStatus.Unhealthy, tags: new[] { "ready" });

var app = builder.Build();

// Auto-migrate when configured (default true outside Production)
var autoMigrate = builder.Configuration.GetValue<bool?>("Database:AutoMigrate")
    ?? !builder.Environment.IsProduction();
if (autoMigrate)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Optional one-shot seed mode for dev
if (args.Contains("--seed"))
{
    var seeded = await EventStageTimer.Api.Setup.SeedData.CreateMinimalAsync(app.Services);
    Console.WriteLine($"Seeded: tenant={seeded.TenantId} owner={seeded.OwnerUserId} room={seeded.RoomId} accessCode={seeded.RoomAccessCode}");
    return;
}

app.UseRouting();
app.UseStaticFiles();
app.UseMiddleware<EventStageTimer.Api.Observability.RequestCorrelationMiddleware>();
app.UseSerilogRequestLogging(o =>
{
    o.MessageTemplate = "HTTP {RequestMethod} {RequestPath} → {StatusCode} in {Elapsed:0}ms";
});
app.UseMiddleware<EventStageTimer.Api.Middleware.PublicRateLimitMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<EventStageTimer.Api.Middleware.TenantResolutionMiddleware>();

app.MapControllers();
app.MapHub<EventStageTimer.Api.Hubs.TimerHub>("/hub/timer");
if (app.Environment.IsDevelopment() || app.Environment.EnvironmentName == "Testing")
    app.MapOpenApi();

// Liveness probe: process responds (no DB check)
app.MapHealthChecks("/health/live", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = _ => false,
});
// Readiness probe: DB reachable
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapFallbackToFile("index.html");

try { app.Run(); }
catch (Exception ex) { Log.Fatal(ex, "Host terminated unexpectedly"); throw; }
finally { Log.CloseAndFlush(); }

public partial class Program { }
