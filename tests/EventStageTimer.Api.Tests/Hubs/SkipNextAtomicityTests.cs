using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class SkipNextAtomicityTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task SkipNext_closes_current_run_with_SkipReplaced_and_starts_next_item()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        // Add a second schedule item
        var i2 = await _http.PostAsJsonAsync($"/api/rooms/{seeded.RoomId}/schedule", new
        {
            Title = "Second", ScheduledStartUtc = _factory.Clock.UtcNow.AddMinutes(2),
            DurationSec = 60, PreRollSec = 0, AutoStart = false,
        });
        var secondId = (await i2.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        await using var conn = AuthHelpers.BuildAuthenticatedHubConnection(_factory, _http);
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", seeded.RoomId);
        snap = await conn.InvokeAsync<Snapshot>("StartItem", seeded.RoomId, seeded.ItemId, snap!.Version);
        snap = await conn.InvokeAsync<Snapshot>("SkipNext", seeded.RoomId, snap.Version);

        snap.Phase.Should().Be(TimerPhase.Running);
        snap.CurrentItem!.Id.Should().Be(secondId);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var firstRun = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstAsync(r => r.ScheduleItemId == seeded.ItemId);
        firstRun.EndedReason.Should().Be(RunEndedReason.SkipReplaced);
        firstRun.EndedAtUtc.Should().NotBeNull();

        var secondRun = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstAsync(r => r.ScheduleItemId == secondId);
        secondRun.Trigger.Should().Be(RunTrigger.Skip);
        secondRun.EndedAtUtc.Should().BeNull();
    }
}
