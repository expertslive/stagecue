using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class FullSessionTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Operator_runs_full_session_against_seeded_room()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        await using var conn = AuthHelpers.BuildAuthenticatedHubConnection(_factory, _http);
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", seeded.RoomId);
        snap.Should().NotBeNull();
        snap!.Phase.Should().Be(TimerPhase.Idle);

        // Start
        snap = await conn.InvokeAsync<Snapshot>("StartItem", seeded.RoomId, seeded.ItemId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Running);
        snap.StartedAtUtc.Should().NotBeNull();

        // Pause + Resume
        _factory.Clock.Advance(TimeSpan.FromSeconds(60));
        snap = await conn.InvokeAsync<Snapshot>("Pause", seeded.RoomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Paused);

        _factory.Clock.Advance(TimeSpan.FromSeconds(15));
        snap = await conn.InvokeAsync<Snapshot>("Resume", seeded.RoomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Running);
        snap.PausedAccumSec.Should().Be(15);

        // Stop
        snap = await conn.InvokeAsync<Snapshot>("Stop", seeded.RoomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Ended);

        // Run was opened and closed
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var run = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.ScheduleItemId == seeded.ItemId);
        run.Should().NotBeNull();
        run!.EndedAtUtc.Should().NotBeNull();
        run.EndedReason.Should().Be(RunEndedReason.Stop);
    }
}
