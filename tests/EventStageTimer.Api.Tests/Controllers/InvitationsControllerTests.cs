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
public sealed class InvitationsControllerTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Invited_user_can_accept_and_gets_membership()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http, "owner@t.local");
        var token = await CreateInvitationAsync(seeded.EventId, "invitee@t.local", EventRole.Viewer);

        await CreateUserAsync("invitee@t.local", "Strong_Pwd_123");
        await SwitchUserAsync("invitee@t.local", "Strong_Pwd_123");

        var resp = await _http.PostAsync($"/api/invitations/{token}/accept", null);
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("eventId").GetGuid().Should().Be(seeded.EventId);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var u = await users.FindByEmailAsync("invitee@t.local");
        var hasMembership = await db.EventMemberships.IgnoreQueryFilters()
            .AnyAsync(m => m.EventId == seeded.EventId && m.UserId == u!.Id && m.Role == EventRole.Viewer);
        hasMembership.Should().BeTrue();
    }

    [Fact]
    public async Task Second_accept_returns_409_AlreadyAccepted()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var token = await CreateInvitationAsync(seeded.EventId, "invitee@t.local", EventRole.Viewer);
        await CreateUserAsync("invitee@t.local", "Strong_Pwd_123");
        await SwitchUserAsync("invitee@t.local", "Strong_Pwd_123");

        (await _http.PostAsync($"/api/invitations/{token}/accept", null)).EnsureSuccessStatusCode();
        var second = await _http.PostAsync($"/api/invitations/{token}/accept", null);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("AlreadyAccepted");
    }

    [Fact]
    public async Task Expired_token_returns_410()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var token = await CreateInvitationAsync(seeded.EventId, "invitee@t.local", EventRole.Viewer);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tokenHash = EventStageTimer.Infrastructure.Auth.TokenHasher.Hash(token);
            var inv = await db.Invitations.IgnoreQueryFilters().FirstAsync(i => i.TokenHash == tokenHash);
            inv.ExpiresAt = _factory.Clock.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        await CreateUserAsync("invitee@t.local", "Strong_Pwd_123");
        await SwitchUserAsync("invitee@t.local", "Strong_Pwd_123");

        var resp = await _http.PostAsync($"/api/invitations/{token}/accept", null);
        resp.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    [Fact]
    public async Task Accepting_user_with_different_email_is_forbidden()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var token = await CreateInvitationAsync(seeded.EventId, "alice@t.local", EventRole.Viewer);

        await CreateUserAsync("bob@t.local", "Strong_Pwd_123");
        await SwitchUserAsync("bob@t.local", "Strong_Pwd_123");

        var resp = await _http.PostAsync($"/api/invitations/{token}/accept", null);
        resp.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Invitation_token_is_stored_only_as_hash()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var token = await CreateInvitationAsync(seeded.EventId, "invitee@t.local", EventRole.Viewer);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var inv = await db.Invitations.IgnoreQueryFilters().SingleAsync();
        inv.TokenHash.Should().NotBe(token);
        inv.TokenHash.Should().Be(EventStageTimer.Infrastructure.Auth.TokenHasher.Hash(token));
    }

    [Fact]
    public async Task Info_endpoint_returns_event_name_for_valid_token()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var token = await CreateInvitationAsync(seeded.EventId, "invitee@t.local", EventRole.RoomOperator);

        var anon = _factory.CreateClient();
        var resp = await anon.GetAsync($"/api/invitations/{token}/info");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("eventName").GetString().Should().Be("Test Event");
        body.GetProperty("role").GetString().Should().Be(EventRole.RoomOperator.ToString());
    }

    private async Task<string> CreateInvitationAsync(Guid eventId, string email, EventRole role)
    {
        var resp = await _http.PostAsJsonAsync($"/api/events/{eventId}/invitations", new { Email = email, Role = role, ScopedRoomIds = (Guid[]?)null });
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var url = body.GetProperty("acceptUrl").GetString()!;
        return url[(url.LastIndexOf('/') + 1)..];
    }

    private async Task CreateUserAsync(string email, string password)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var u = new User { Id = Guid.NewGuid(), Email = email, UserName = email, DisplayName = email, CreatedAtUtc = DateTime.UtcNow };
        (await users.CreateAsync(u, password)).Succeeded.Should().BeTrue();
    }

    private async Task SwitchUserAsync(string email, string password)
    {
        (await _http.PostAsync("/api/auth/password/signout", null)).EnsureSuccessStatusCode();
        _factory.LastSignInCookie = null;
        await AuthHelpers.SignInAsync(_http, email, password);
    }
}
