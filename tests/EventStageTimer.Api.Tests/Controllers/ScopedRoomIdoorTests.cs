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
public sealed class ScopedRoomIdorTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task UpdateRole_rejects_room_from_a_different_event()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var (otherEventId, otherRoomId) = await CreateSecondEventWithRoomAsync();

        // Add a user as a RoomOperator we'll try to scope with a foreign room.
        Guid membershipId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var u = new User { Id = Guid.NewGuid(), Email = "op@t.local", UserName = "op@t.local", DisplayName = "Op", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(u, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var m = new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = u.Id, Role = EventRole.RoomOperator, CreatedAtUtc = DateTime.UtcNow,
            };
            db.EventMemberships.Add(m);
            await db.SaveChangesAsync();
            membershipId = m.Id;
        }

        var resp = await _http.PutAsJsonAsync(
            $"/api/events/{seeded.EventId}/members/{membershipId}",
            new { Role = EventRole.RoomOperator, ScopedRoomIds = new[] { otherRoomId } });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("InvalidRoomIds");

        // No EventMembershipRoom row was created for the foreign room.
        using (var verify = _factory.Services.CreateScope())
        {
            var db = verify.ServiceProvider.GetRequiredService<AppDbContext>();
            (await db.EventMembershipRooms.IgnoreQueryFilters()
                .AnyAsync(r => r.EventMembershipId == membershipId && r.RoomId == otherRoomId))
                .Should().BeFalse();
        }
        _ = otherEventId;
    }

    [Fact]
    public async Task UpdateRole_accepts_room_from_same_event()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        Guid membershipId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var u = new User { Id = Guid.NewGuid(), Email = "op@t.local", UserName = "op@t.local", DisplayName = "Op", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(u, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var m = new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = u.Id, Role = EventRole.RoomOperator, CreatedAtUtc = DateTime.UtcNow,
            };
            db.EventMemberships.Add(m);
            await db.SaveChangesAsync();
            membershipId = m.Id;
        }

        var resp = await _http.PutAsJsonAsync(
            $"/api/events/{seeded.EventId}/members/{membershipId}",
            new { Role = EventRole.RoomOperator, ScopedRoomIds = new[] { seeded.RoomId } });

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task CreateInvitation_rejects_room_from_a_different_event()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var (otherEventId, otherRoomId) = await CreateSecondEventWithRoomAsync();

        var resp = await _http.PostAsJsonAsync(
            $"/api/events/{seeded.EventId}/invitations",
            new { Email = "invitee@t.local", Role = EventRole.RoomOperator, ScopedRoomIds = new[] { otherRoomId } });

        resp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("InvalidRoomIds");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Invitations.IgnoreQueryFilters()
            .AnyAsync(i => i.EventId == seeded.EventId && i.Email == "invitee@t.local"))
            .Should().BeFalse();
        _ = otherEventId;
    }

    private async Task<(Guid eventId, Guid roomId)> CreateSecondEventWithRoomAsync()
    {
        var ev = await _http.PostAsJsonAsync("/api/events", new
        {
            Name = "Second Event", TimeZone = "UTC",
            StartsAtUtc = _factory.Clock.UtcNow, EndsAtUtc = _factory.Clock.UtcNow.AddHours(8),
        });
        ev.EnsureSuccessStatusCode();
        var eventId = (await ev.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "Other Hall" });
        room.EnsureSuccessStatusCode();
        var roomId = (await room.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        return (eventId, roomId);
    }
}
