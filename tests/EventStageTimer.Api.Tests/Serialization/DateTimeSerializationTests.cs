using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Serialization;

[Collection("sqlserver")]
public sealed class DateTimeSerializationTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Event_dates_are_serialized_as_UTC_with_Z_suffix()
    {
        await TestSeed.CreateAsync(_factory, _http);
        var raw = await _http.GetStringAsync("/api/events");
        var doc = JsonDocument.Parse(raw);
        var ev = doc.RootElement[0];
        var startsAtIso = ev.GetProperty("startsAtUtc").GetString();
        var endsAtIso = ev.GetProperty("endsAtUtc").GetString();

        // Without this guard browsers would parse the string as local time and shift every
        // displayed timestamp by the viewer's timezone offset.
        startsAtIso.Should().EndWith("Z");
        endsAtIso.Should().EndWith("Z");
    }
}
