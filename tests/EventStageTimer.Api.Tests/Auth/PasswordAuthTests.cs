using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
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
    public async Task Account_is_locked_out_after_5_failed_attempts()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@test.local", "Strong_Pwd_123");

        for (int i = 0; i < 5; i++)
        {
            var bad = await _http.PostAsJsonAsync("/api/auth/password/signin",
                new { Email = "o@test.local", Password = "Wrong_Pwd_123" });
            bad.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        // Sixth attempt — even with correct password — must return 401 because the account is locked.
        var locked = await _http.PostAsJsonAsync("/api/auth/password/signin",
            new { Email = "o@test.local", Password = "Strong_Pwd_123" });
        locked.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var u = await users.FindByEmailAsync("o@test.local");
        (await users.IsLockedOutAsync(u!)).Should().BeTrue();
    }

    [Fact]
    public async Task Successful_signin_resets_failed_attempt_count()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@test.local", "Strong_Pwd_123");

        // 4 failures (one short of the lockout threshold)
        for (int i = 0; i < 4; i++)
        {
            (await _http.PostAsJsonAsync("/api/auth/password/signin",
                new { Email = "o@test.local", Password = "Wrong_Pwd_123" }))
                .StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        // Successful sign-in
        (await _http.PostAsJsonAsync("/api/auth/password/signin",
            new { Email = "o@test.local", Password = "Strong_Pwd_123" }))
            .EnsureSuccessStatusCode();

        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var u = await users.FindByEmailAsync("o@test.local");
        (await users.GetAccessFailedCountAsync(u!)).Should().Be(0);
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
