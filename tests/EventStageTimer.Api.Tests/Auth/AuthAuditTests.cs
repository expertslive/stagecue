using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Auth;

[Collection("sqlserver")]
public sealed class AuthAuditTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Successful_password_signin_writes_SignInSuccess_audit()
    {
        var bs = await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rows = await db.AuditLog.IgnoreQueryFilters()
            .Where(a => a.TenantId == bs.TenantId && a.UserId == bs.UserId && a.Action == "Auth.SignInSuccess")
            .ToListAsync();
        rows.Should().HaveCount(1);
        rows[0].DetailsJson.Should().Contain("\"method\":\"Password\"");
    }

    [Fact]
    public async Task Failed_password_signin_writes_SignInFailed_audit()
    {
        var bs = await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");

        var bad = await _http.PostAsJsonAsync("/api/auth/password/signin",
            new { Email = "o@t.local", Password = "Wrong_Pwd_123" });
        bad.StatusCode.Should().Be(System.Net.HttpStatusCode.Unauthorized);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rows = await db.AuditLog.IgnoreQueryFilters()
            .Where(a => a.TenantId == bs.TenantId && a.UserId == bs.UserId && a.Action == "Auth.SignInFailed")
            .ToListAsync();
        rows.Should().HaveCount(1);
        rows[0].DetailsJson.Should().Contain("BadPassword");
    }

    [Fact]
    public async Task Lockout_writes_AccountLocked_audit_on_5th_failure()
    {
        var bs = await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");

        for (int i = 0; i < 5; i++)
        {
            await _http.PostAsJsonAsync("/api/auth/password/signin",
                new { Email = "o@t.local", Password = "Wrong_Pwd_123" });
        }

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var failedCount = await db.AuditLog.IgnoreQueryFilters()
            .CountAsync(a => a.TenantId == bs.TenantId && a.Action == "Auth.SignInFailed");
        var lockedCount = await db.AuditLog.IgnoreQueryFilters()
            .CountAsync(a => a.TenantId == bs.TenantId && a.Action == "Auth.AccountLocked");
        // First 4 attempts: SignInFailed. 5th attempt: AccountLocked (trips the threshold).
        failedCount.Should().Be(4);
        lockedCount.Should().Be(1);
    }

    [Fact]
    public async Task SignOut_writes_audit_entry()
    {
        var bs = await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");
        (await _http.PostAsync("/api/auth/password/signout", null)).EnsureSuccessStatusCode();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.AuditLog.IgnoreQueryFilters()
            .AnyAsync(a => a.TenantId == bs.TenantId && a.UserId == bs.UserId && a.Action == "Auth.SignOut"))
            .Should().BeTrue();
    }

    [Fact]
    public async Task MagicLink_consume_writes_SignInSuccess_audit_with_MagicLink_method()
    {
        var bs = await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        using var scope = _factory.Services.CreateScope();
        var svc = scope.ServiceProvider.GetRequiredService<EventStageTimer.Api.Auth.MagicLink.MagicLinkService>();
        var token = await svc.IssueAsync("o@t.local", default);

        (await _http.GetAsync($"/api/auth/magic-link/consume?token={Uri.EscapeDataString(token)}")).EnsureSuccessStatusCode();

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.AuditLog.IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.TenantId == bs.TenantId && a.Action == "Auth.SignInSuccess" && a.UserId == bs.UserId);
        row.Should().NotBeNull();
        row!.DetailsJson.Should().Contain("\"method\":\"MagicLink\"");
    }
}
