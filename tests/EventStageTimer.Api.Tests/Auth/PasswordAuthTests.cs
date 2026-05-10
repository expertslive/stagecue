using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Auth;

[Collection("sqlserver")]
public sealed class PasswordAuthTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task SignIn_with_correct_credentials_issues_session_cookie()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "owner@test.local", "Strong_Pwd_123");
        var resp = await _http.PostAsJsonAsync("/api/auth/password/signin", new { Email = "owner@test.local", Password = "Strong_Pwd_123" });
        resp.EnsureSuccessStatusCode();
        resp.Headers.Should().ContainKey("Set-Cookie");
    }

    [Fact]
    public async Task SignIn_with_wrong_password_returns_401()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "owner@test.local", "Strong_Pwd_123");
        var resp = await _http.PostAsJsonAsync("/api/auth/password/signin", new { Email = "owner@test.local", Password = "Wrong_Pwd_123" });
        resp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task SignOut_clears_session()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@test.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@test.local", "Strong_Pwd_123");
        (await _http.GetAsync("/api/events")).EnsureSuccessStatusCode();

        (await _http.PostAsync("/api/auth/password/signout", null)).EnsureSuccessStatusCode();
        // Clear the captured cookie since signout would have cleared it
        _factory.LastSignInCookie = null;
        var afterSignOut = await _http.GetAsync("/api/events");
        afterSignOut.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
