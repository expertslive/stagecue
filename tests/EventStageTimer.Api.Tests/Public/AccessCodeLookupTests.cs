using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Public;

[Collection("sqlserver")]
public sealed class AccessCodeLookupTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Valid_room_access_code_resolves_room_and_event()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        // New client (no auth cookie) — public lookup only
        var pub = _factory.CreateClient();
        var dashed = $"{seeded.RoomAccessCode[..4]}-{seeded.RoomAccessCode[4..]}";
        var resp = await pub.GetAsync($"/r/{dashed}/ping");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("roomId").GetGuid().Should().Be(seeded.RoomId);
        body.GetProperty("eventId").GetGuid().Should().Be(seeded.EventId);
    }

    [Fact]
    public async Task Unknown_access_code_returns_401()
    {
        var pub = _factory.CreateClient();
        var resp = await pub.GetAsync("/r/AAAA-AAAA/ping");
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
