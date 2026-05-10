using EventStageTimer.Api.Setup;
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EventStageTimer.Api.Tests.Seed;

[Collection("sqlserver")]
public sealed class SeedDataTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    public Task InitializeAsync() { _factory = new TestApiFactory(sql); return Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task CreateMinimalAsync_produces_runnable_seed_data()
    {
        // Force migration apply once
        using (var scope = _factory.Services.CreateScope())
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();

        var ids = await SeedData.CreateMinimalAsync(_factory.Services, ownerEmail: $"owner-{Guid.NewGuid():N}@local");

        using var scope2 = _factory.Services.CreateScope();
        var db = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Rooms.IgnoreQueryFilters().AnyAsync(r => r.Id == ids.RoomId)).Should().BeTrue();
        (await db.RoomTimerStates.IgnoreQueryFilters().AnyAsync(s => s.RoomId == ids.RoomId && s.Phase == TimerPhase.Idle)).Should().BeTrue();
        (await db.ScheduleItems.IgnoreQueryFilters().AnyAsync(s => s.Id == ids.ScheduleItemId)).Should().BeTrue();
        ids.RoomAccessCode.Should().HaveLength(8);
        ids.LobbyAccessCode.Should().HaveLength(8);
    }
}
