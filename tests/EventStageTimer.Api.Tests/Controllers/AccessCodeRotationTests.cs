using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Controllers;

[Collection("sqlserver")]
public sealed class AccessCodeRotationTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task EventAdmin_can_rotate_lobby_code_and_old_code_stops_working()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        var ev = await (await _http.GetAsync($"/api/events/{seeded.EventId}")).Content.ReadFromJsonAsync<JsonElement>();
        var oldCode = ev.GetProperty("lobbyAccessCode").GetString()!;

        // Old code works against the lobby info endpoint.
        var pub = _factory.CreateClient();
        var oldDashed = $"{oldCode[..4]}-{oldCode[4..]}";
        (await pub.GetAsync($"/e/{oldDashed}/info")).EnsureSuccessStatusCode();

        var rotate = await _http.PostAsync($"/api/events/{seeded.EventId}/regenerate-lobby-access-code", null);
        rotate.EnsureSuccessStatusCode();
        var rotated = await rotate.Content.ReadFromJsonAsync<JsonElement>();
        var newCode = rotated.GetProperty("lobbyAccessCode").GetString()!;
        newCode.Should().NotBe(oldCode);

        // Old code now rejected.
        var oldResp = await pub.GetAsync($"/e/{oldDashed}/info");
        oldResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // New code works.
        var newDashed = $"{newCode[..4]}-{newCode[4..]}";
        (await pub.GetAsync($"/e/{newDashed}/info")).EnsureSuccessStatusCode();

        // Audit entry written.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var audit = await db.AuditLog.IgnoreQueryFilters()
            .Where(a => a.EventId == seeded.EventId && a.Action == "RegenerateLobbyAccessCode")
            .CountAsync();
        audit.Should().Be(1);
    }

    [Fact]
    public async Task Viewer_cannot_rotate_lobby_code()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http, "owner@t.local");

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var v = new User { Id = Guid.NewGuid(), Email = "viewer@t.local", UserName = "viewer@t.local", DisplayName = "Viewer", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(v, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.EventMemberships.Add(new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = v.Id, Role = EventRole.Viewer, CreatedAtUtc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        (await _http.PostAsync("/api/auth/password/signout", null)).EnsureSuccessStatusCode();
        _factory.LastSignInCookie = null;
        await AuthHelpers.SignInAsync(_http, "viewer@t.local", "Strong_Pwd_123");

        var resp = await _http.PostAsync($"/api/events/{seeded.EventId}/regenerate-lobby-access-code", null);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
