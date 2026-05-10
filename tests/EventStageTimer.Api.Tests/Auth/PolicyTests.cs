using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Auth;

[Collection("sqlserver")]
public sealed class PolicyTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Viewer_cannot_create_room_in_event_they_only_view()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http, "owner@t.local");

        // Create a Viewer user directly in DB and add membership
        Guid viewerId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var v = new User { Id = Guid.NewGuid(), Email = "viewer@t.local", UserName = "viewer@t.local", DisplayName = "Viewer", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(v, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            viewerId = v.Id;
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.EventMemberships.Add(new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = viewerId, Role = EventRole.Viewer, CreatedAtUtc = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        // Sign out owner, sign in viewer
        (await _http.PostAsync("/api/auth/password/signout", null)).EnsureSuccessStatusCode();
        _factory.LastSignInCookie = null;
        await AuthHelpers.SignInAsync(_http, "viewer@t.local", "Strong_Pwd_123");

        // Viewer can list rooms (Viewer policy) but cannot create
        var listResp = await _http.GetAsync($"/api/events/{seeded.EventId}/rooms");
        listResp.EnsureSuccessStatusCode();

        var createResp = await _http.PostAsJsonAsync($"/api/events/{seeded.EventId}/rooms", new { Name = "X" });
        createResp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
