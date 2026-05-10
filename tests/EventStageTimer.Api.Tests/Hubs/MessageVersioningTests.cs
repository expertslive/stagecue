using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class MessageVersioningTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task SetMessage_does_not_bump_version_so_subsequent_state_command_with_same_version_succeeds()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        await using var conn = AuthHelpers.BuildAuthenticatedHubConnection(_factory, _http);
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", seeded.RoomId);
        snap = await conn.InvokeAsync<Snapshot>("StartItem", seeded.RoomId, seeded.ItemId, snap!.Version);
        var versionAtStart = snap.Version;

        // Push messages — version must NOT change
        snap = await conn.InvokeAsync<Snapshot>("SetMessage", seeded.RoomId, "Wrap up");
        snap.Version.Should().Be(versionAtStart);
        snap = await conn.InvokeAsync<Snapshot>("SetMessage", seeded.RoomId, "5 min over");
        snap.Version.Should().Be(versionAtStart);

        // Pause with the version we already had still succeeds because messages didn't bump it.
        snap = await conn.InvokeAsync<Snapshot>("Pause", seeded.RoomId, versionAtStart);
        snap.Phase.Should().Be(TimerPhase.Paused);
        snap.Version.Should().NotBe(versionAtStart); // Pause DID bump
    }
}
