using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EventStageTimer.Api.Tests.Tenancy;

[Collection("sqlserver")]
public sealed class TenantIsolationTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); return Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Setting_one_tenant_id_hides_events_from_other_tenants()
    {
        Guid tenantA, tenantB, eventA, eventB;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.Migrate();
            tenantA = Guid.NewGuid(); tenantB = Guid.NewGuid();
            db.Tenants.AddRange(
                new Tenant { Id = tenantA, Name = "A", Slug = $"a-{Guid.NewGuid():N}", Mode = TenantMode.SaaS, CreatedAtUtc = DateTime.UtcNow },
                new Tenant { Id = tenantB, Name = "B", Slug = $"b-{Guid.NewGuid():N}", Mode = TenantMode.SaaS, CreatedAtUtc = DateTime.UtcNow });
            eventA = Guid.NewGuid(); eventB = Guid.NewGuid();
            db.Events.AddRange(
                new Event { Id = eventA, TenantId = tenantA, Name = "EA", TimeZone = "UTC", StartsAtUtc = DateTime.UtcNow, EndsAtUtc = DateTime.UtcNow.AddHours(1), LobbyAccessCode = NewCode(), CreatedAtUtc = DateTime.UtcNow },
                new Event { Id = eventB, TenantId = tenantB, Name = "EB", TimeZone = "UTC", StartsAtUtc = DateTime.UtcNow, EndsAtUtc = DateTime.UtcNow.AddHours(1), LobbyAccessCode = NewCode(), CreatedAtUtc = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }

        // Read with tenant A scope
        using (var scope = _factory.Services.CreateScope())
        {
            var tenantCtx = scope.ServiceProvider.GetRequiredService<ITenantContext>();
            tenantCtx.Set(tenantA);
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var visible = await db.Events.Select(e => e.Id).ToListAsync();
            visible.Should().Contain(eventA);
            visible.Should().NotContain(eventB);
        }

        // Bypass with IgnoreQueryFilters returns both
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.Events.IgnoreQueryFilters().CountAsync()).Should().BeGreaterOrEqualTo(2);
        }
    }

    private static string NewCode()
    {
        const string alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var rng = new Random();
        return new string(Enumerable.Range(0, 8).Select(_ => alpha[rng.Next(alpha.Length)]).ToArray());
    }
}
