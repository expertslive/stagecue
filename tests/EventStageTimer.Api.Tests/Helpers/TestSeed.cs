using EventStageTimer.Api.Tests.Fixtures;
using System.Net.Http.Json;
using System.Text.Json;

namespace EventStageTimer.Api.Tests.Helpers;

/// <summary>Shared in-memory helpers for integration tests (bootstrap, sign in, create event/room/item via REST).</summary>
public static class TestSeed
{
    public sealed record Seeded(Guid TenantId, Guid OwnerUserId, Guid EventId, Guid RoomId, string RoomAccessCode, Guid ItemId);

    public static async Task<Seeded> CreateAsync(TestApiFactory factory, HttpClient http, string ownerEmail = "owner@test.local",
        int durationSec = 300, int preRollSec = 0, bool autoStart = false)
    {
        var bootstrap = await AuthHelpers.BootstrapTenantAsync(http, ownerEmail, "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(http, ownerEmail, "Strong_Pwd_123");

        var ev = await http.PostAsJsonAsync("/api/events", new
        {
            Name = "Test Event", TimeZone = "UTC",
            StartsAtUtc = factory.Clock.UtcNow,
            EndsAtUtc = factory.Clock.UtcNow.AddHours(8),
        });
        ev.EnsureSuccessStatusCode();
        var eventId = (await ev.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var room = await http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "Main Hall" });
        room.EnsureSuccessStatusCode();
        var roomDoc = await room.Content.ReadFromJsonAsync<JsonElement>();
        var roomId = roomDoc.GetProperty("id").GetGuid();
        var roomCode = roomDoc.GetProperty("accessCode").GetString()!;

        var item = await http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new
        {
            Title = "Keynote", SpeakerName = "Ada Lovelace",
            ScheduledStartUtc = factory.Clock.UtcNow,
            DurationSec = durationSec, PreRollSec = preRollSec, AutoStart = autoStart,
        });
        item.EnsureSuccessStatusCode();
        var itemId = (await item.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        return new Seeded(bootstrap.TenantId, bootstrap.UserId, eventId, roomId, roomCode, itemId);
    }
}
