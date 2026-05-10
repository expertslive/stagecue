using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace EventStageTimer.Api.Tests.Auth;

[Collection("sqlserver")]
public sealed class MagicLinkAuthTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Request_then_consume_signs_in_user_with_tenant_claim()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "owner@test.local", "Strong_Pwd_123");

        using var scope = _factory.Services.CreateScope();
        var svc = scope.ServiceProvider.GetRequiredService<EventStageTimer.Api.Auth.MagicLink.MagicLinkService>();
        var token = await svc.IssueAsync("owner@test.local", default);

        var resp = await _http.GetAsync($"/api/auth/magic-link/consume?token={Uri.EscapeDataString(token)}");
        resp.EnsureSuccessStatusCode();
        resp.Headers.Should().ContainKey("Set-Cookie");

        // Subsequent authenticated request succeeds (cookie attached by recorder)
        var listResp = await _http.GetAsync("/api/events");
        listResp.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Token_is_single_use_and_expires()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "u@test.local", "Strong_Pwd_123");
        using var scope = _factory.Services.CreateScope();
        var svc = scope.ServiceProvider.GetRequiredService<EventStageTimer.Api.Auth.MagicLink.MagicLinkService>();
        var token = await svc.IssueAsync("u@test.local", default);

        // First consume succeeds
        (await _http.GetAsync($"/api/auth/magic-link/consume?token={token}")).EnsureSuccessStatusCode();

        // Second consume fails (used)
        var second = await _http.GetAsync($"/api/auth/magic-link/consume?token={token}");
        second.StatusCode.Should().Be(System.Net.HttpStatusCode.Unauthorized);

        // Issue a new token and advance the clock past 15 minutes
        var freshToken = await svc.IssueAsync("u@test.local", default);
        _factory.Clock.Advance(TimeSpan.FromMinutes(16));
        var expired = await _http.GetAsync($"/api/auth/magic-link/consume?token={freshToken}");
        expired.StatusCode.Should().Be(System.Net.HttpStatusCode.Unauthorized);
    }
}
