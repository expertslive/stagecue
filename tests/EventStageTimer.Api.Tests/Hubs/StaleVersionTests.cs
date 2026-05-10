using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class StaleVersionTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Hub_rejects_command_with_stale_version()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        await using var conn = AuthHelpers.BuildAuthenticatedHubConnection(_factory, _http);
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", seeded.RoomId);
        var staleVersion = snap!.Version;

        // First Start succeeds and bumps version
        await conn.InvokeAsync<Snapshot>("StartItem", seeded.RoomId, seeded.ItemId, staleVersion);

        // Second command with the OLD version must throw
        var act = async () => await conn.InvokeAsync<Snapshot>("Pause", seeded.RoomId, staleVersion);
        await act.Should().ThrowAsync<HubException>().WithMessage("*StaleVersion*");
    }
}
