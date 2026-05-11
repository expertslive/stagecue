using EventStageTimer.Api.Tests.Fixtures;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Api.Tests.Middleware;

[Collection("sqlserver")]
public sealed class SecurityHeadersTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Baseline_security_headers_present_on_any_endpoint()
    {
        var resp = await _http.GetAsync("/health");
        resp.EnsureSuccessStatusCode();
        resp.Headers.GetValues("X-Content-Type-Options").Single().Should().Be("nosniff");
        resp.Headers.GetValues("X-Frame-Options").Single().Should().Be("DENY");
        resp.Headers.GetValues("Referrer-Policy").Single().Should().Be("strict-origin-when-cross-origin");
        resp.Headers.GetValues("Permissions-Policy").Single().Should().Contain("geolocation=()");
        resp.Headers.GetValues("Strict-Transport-Security").Single().Should().Contain("max-age=");
    }
}
