using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EventStageTimer.Api.Tests.Background;

[Collection("sqlserver")]
public sealed class SchedulerServiceTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task AutoStart_fires_at_scheduled_time_minus_preroll_then_transitions_to_Running()
    {
        // Item scheduled 30s in the future, with 10s pre-roll, AutoStart=true
        var seeded = await TestSeed.CreateAsync(_factory, _http, durationSec: 60, preRollSec: 10, autoStart: true);

        // The seed creates the item at clock.UtcNow with PreRollSec=10. To make the scheduler observe
        // it as "due in 21 seconds" we update the schedule item's ScheduledStartUtc to clock+30.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var item = await db.ScheduleItems.IgnoreQueryFilters().FirstAsync(s => s.Id == seeded.ItemId);
            item.ScheduledStartUtc = _factory.Clock.UtcNow.AddSeconds(30);
            await db.SaveChangesAsync();
        }

        // Advance clock past (Scheduled - PreRoll) — i.e. 21 seconds
        _factory.Clock.Advance(TimeSpan.FromSeconds(21));

        await WaitForPhaseAsync(seeded.RoomId, TimerPhase.PreRoll, TimeSpan.FromSeconds(5));

        // Advance past pre-roll
        _factory.Clock.Advance(TimeSpan.FromSeconds(11));
        await WaitForPhaseAsync(seeded.RoomId, TimerPhase.Running, TimeSpan.FromSeconds(5));
    }

    private async Task WaitForPhaseAsync(Guid roomId, TimerPhase expected, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var phase = await db.RoomTimerStates.IgnoreQueryFilters().Where(s => s.RoomId == roomId).Select(s => s.Phase).FirstAsync();
            if (phase == expected) return;
            await Task.Delay(200);
        }
        throw new TimeoutException($"Room {roomId} did not reach {expected} within {timeout}");
    }
}
