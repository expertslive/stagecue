using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

// Tenancy
builder.Services.AddScoped<ITenantContext, NullTenantContext>();

// Database
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlServer(
        builder.Configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is required"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

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

app.MapControllers();
app.MapOpenApi();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program { }
