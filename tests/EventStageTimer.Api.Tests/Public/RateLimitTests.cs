using EventStageTimer.Api.Tests.Fixtures;
using FluentAssertions;
using System.Net;
using Xunit;

namespace EventStageTimer.Api.Tests.Public;

[Collection("sqlserver")]
public sealed class RateLimitTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Public_lookup_returns_429_after_burst_exhausted()
    {
        // Burst = 30. Fire 60 requests to a non-existent code; first ~30 get 401, then 429.
        var unauthorized = 0;
        var rateLimited = 0;
        for (var i = 0; i < 60; i++)
        {
            var resp = await _http.GetAsync("/r/AAAA-AAAA/ping");
            if (resp.StatusCode == HttpStatusCode.Unauthorized) unauthorized++;
            else if (resp.StatusCode == (HttpStatusCode)429) rateLimited++;
        }
        rateLimited.Should().BeGreaterThan(0, "rate limiter should kick in once burst is consumed");
        unauthorized.Should().BeLessOrEqualTo(31); // burst + 1 refill
    }
}
