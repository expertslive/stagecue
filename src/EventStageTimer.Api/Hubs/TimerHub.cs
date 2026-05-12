using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using EventStageTimer.Infrastructure.Timer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Security.Claims;

namespace EventStageTimer.Api.Hubs;

internal static class HubGroups
{
    public static string Room(Guid roomId) => $"room:{roomId}";
    public static string EventLobby(Guid eventId) => $"event-lobby:{eventId}";
    public static string EventControl(Guid eventId) => $"event-control:{eventId}";
}

public sealed record RoomDisplayPresenceDto(int Speaker, int Door, int Other);
public sealed record DisplayPresenceDto(int Lobby, IReadOnlyDictionary<Guid, RoomDisplayPresenceDto> Rooms);

[Authorize(AuthenticationSchemes = IdentitySetup.SchemeName + "," + PublicAccessCodeAuthHandler.SchemeName)]
public sealed class TimerHub(
    AppDbContext db,
    ITimerCommandService commands,
    PublicAccessContext publicCtx,
    ITenantContext tenantContext,
    IClock clock) : Hub
{
    private static readonly ConcurrentDictionary<string, int> Presence = new();

    /// <summary>
    /// SignalR creates a fresh DI scope per hub method invocation, so both the request-scoped
    /// <see cref="ITenantContext"/> and <see cref="PublicAccessContext"/> arrive empty. We
    /// rebuild them from the authenticated user's claims (set by the public access code
    /// handler during the initial connect) before touching the DB so EF's strict tenant
    /// filter applies correctly and public-scope checks (lobby / per-room) keep working.
    /// </summary>
    private void EnsureTenantContext()
    {
        // Rehydrate PublicAccessContext from claims if it's empty in this scope.
        if (publicCtx.TenantId is null && Context.User?.FindFirst("scope") is { } scopeClaim)
        {
            var scope = scopeClaim.Value;
            if (scope is "lobby" or "room")
            {
                if (Guid.TryParse(Context.User.FindFirstValue("tid"), out var tid)) publicCtx.TenantId = tid;
                if (Guid.TryParse(Context.User.FindFirstValue("eid"), out var eid)) publicCtx.EventId = eid;
                if (Guid.TryParse(Context.User.FindFirstValue("rid"), out var rid)) publicCtx.RoomId = rid;
                publicCtx.AccessCode = Context.User.FindFirstValue("acl");
                publicCtx.IsLobbyCode = scope == "lobby";
            }
        }

        if (tenantContext.TenantId.HasValue) return;
        if (publicCtx.TenantId is { } publicTenant) { tenantContext.Set(publicTenant); return; }
        var tidClaim = Context.User?.FindFirstValue("tid");
        if (Guid.TryParse(tidClaim, out var fromClaim)) tenantContext.Set(fromClaim);
    }

    public override async Task OnConnectedAsync()
    {
        EnsureTenantContext();
        // Authenticated operator: join groups for any rooms in their accessible events.
        var userIdClaim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdClaim, out var userId))
        {
            var accessibleRoomIds = await db.Rooms
                .Where(r => r.Event.Memberships.Any(m => m.UserId == userId))
                .Select(r => new { r.Id, r.EventId })
                .ToListAsync();
            foreach (var r in accessibleRoomIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Room(r.Id));
                await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.EventControl(r.EventId));
            }
        }

        // Public client: join based on access code scope
        if (publicCtx.RoomId is { } pubRoom)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Room(pubRoom));
            RegisterPresence(PresenceKeyForRoom(pubRoom, SurfaceFromQuery()));
            var snap = await commands.GetSnapshotAsync(pubRoom, Context.ConnectionAborted);
            if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
            var eventId = await db.Rooms.Where(r => r.Id == pubRoom).Select(r => r.EventId).FirstOrDefaultAsync();
            if (eventId != Guid.Empty) await BroadcastPresenceAsync(eventId);
        }
        if (publicCtx.IsLobbyCode && publicCtx.EventId is { } pubEvent)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.EventLobby(pubEvent));
            RegisterPresence(PresenceKeyForLobby(pubEvent));
            var lobbyRooms = await db.Rooms.Where(r => r.EventId == pubEvent).Select(r => r.Id).ToListAsync();
            foreach (var rid in lobbyRooms)
            {
                var snap = await commands.GetSnapshotAsync(rid, Context.ConnectionAborted);
                if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
            }
            await BroadcastPresenceAsync(pubEvent);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        EnsureTenantContext();
        if (Context.Items.TryGetValue("presenceKeys", out var raw) && raw is List<string> keys)
        {
            foreach (var key in keys) DecrementPresence(key);
            if (publicCtx.EventId is { } eventId) await BroadcastPresenceAsync(eventId);
            else if (publicCtx.RoomId is { } roomId)
            {
                var disconnectedEventId = await db.Rooms.Where(r => r.Id == roomId).Select(r => r.EventId).FirstOrDefaultAsync();
                if (disconnectedEventId != Guid.Empty) await BroadcastPresenceAsync(disconnectedEventId);
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>Returns the current snapshot for a room. Caller must have at least Viewer-level access (or be the public-code client for this room, or a lobby code for this room's event).</summary>
    public async Task<Snapshot?> Resync(Guid roomId)
    {
        EnsureTenantContext();
        if (publicCtx.RoomId == roomId)
            return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);

        // Lobby code may resync any room in the same event. The initial fan-out in
        // OnConnectedAsync occasionally races client-side handler registration in dev,
        // so the client requests per-room snapshots after connect as a fallback.
        if (publicCtx.IsLobbyCode && publicCtx.EventId is { } lobbyEventId)
        {
            var roomEventId = await db.Rooms
                .Where(r => r.Id == roomId)
                .Select(r => (Guid?)r.EventId)
                .FirstOrDefaultAsync();
            if (roomEventId == lobbyEventId)
                return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);
        }

        await EnsureRoomAccessAsync(roomId, EventRole.Viewer);
        return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);
    }

    public async Task<DisplayPresenceDto> GetPresenceForEvent(Guid eventId)
    {
        EnsureTenantContext();
        var userId = RequireOperator();
        var membership = await db.EventMemberships
            .Where(m => m.EventId == eventId && m.UserId == userId)
            .Select(m => m.Id)
            .FirstOrDefaultAsync();
        if (membership == Guid.Empty) throw new HubException("Forbidden");
        return await BuildPresenceAsync(eventId);
    }

    // -------- State-changing methods (versioned) --------
    // Each method requires at least RoomOperator role on the room (which an EventAdmin
    // satisfies because EventRole values are ordered numerically: EventAdmin=1, RoomOperator=2,
    // Viewer=3, and our access checks accept role ≤ MinimumRole).

    public Task<Snapshot> StartAuto(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.StartAutoAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> StartItem(Guid roomId, Guid scheduleItemId, long version) =>
        InvokeAsync(async uid => await commands.StartItemAsync(roomId, scheduleItemId, RunTriggerKind.Operator, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> Pause(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.PauseAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> Resume(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.ResumeAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> Stop(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.StopAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> Reset(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.ResetAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> SkipNext(Guid roomId, long version) =>
        InvokeAsync(async uid => await commands.SkipNextAsync(roomId, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> AdjustTime(Guid roomId, int deltaSec, long version) =>
        InvokeAsync(async uid => await commands.AdjustTimeAsync(roomId, deltaSec, version, uid, Context.ConnectionAborted), roomId);

    public Task<Snapshot> SetExactRemaining(Guid roomId, int remainingSec, long version) =>
        InvokeAsync(async uid => await commands.SetExactRemainingAsync(roomId, remainingSec, version, uid, Context.ConnectionAborted), roomId);

    // -------- Unversioned message methods (last-write-wins) --------

    public async Task<Snapshot> SetMessage(Guid roomId, string? message)
    {
        EnsureTenantContext();
        var userId = RequireOperator();
        await EnsureRoomAccessAsync(roomId, EventRole.RoomOperator);
        var result = await commands.SetMessageAsync(roomId, message, userId, Context.ConnectionAborted);
        if (!result.IsSuccess) throw new HubException($"{result.Outcome}");
        await Clients.Group(HubGroups.Room(roomId)).SendAsync("MessageChanged", new { roomId, message });
        return result.Snapshot!;
    }

    public Task<Snapshot> ClearMessage(Guid roomId) => SetMessage(roomId, null);

    // -------- Helpers --------

    private Guid RequireOperator()
    {
        var uid = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(uid, out var userId))
            throw new HubException("Forbidden: operator authentication required");
        return userId;
    }

    /// <summary>
    /// Verifies that the calling user has at least the requested role on the parent event of <paramref name="roomId"/>.
    /// For RoomOperator, additionally requires that the room is in the user's scoped-rooms join.
    /// EventAdmin role satisfies any minimum role.
    /// </summary>
    private async Task EnsureRoomAccessAsync(Guid roomId, EventRole minimumRole)
    {
        var userId = RequireOperator();
        // System-scoped lookup — the hub method runs in the user's request scope but tenant
        // matching is enforced by joining through Event.Memberships, which the global query
        // filter already restricts to the caller's tenant.
        var room = await db.Rooms
            .Where(r => r.Id == roomId)
            .Select(r => new { r.Id, r.EventId })
            .FirstOrDefaultAsync();
        if (room is null) throw new HubException("Forbidden");

        var membership = await db.EventMemberships
            .Where(m => m.EventId == room.EventId && m.UserId == userId)
            .Select(m => new { m.Id, m.Role })
            .FirstOrDefaultAsync();
        if (membership is null) throw new HubException("Forbidden");
        if (membership.Role > minimumRole) throw new HubException("Forbidden");

        if (membership.Role == EventRole.RoomOperator && minimumRole == EventRole.RoomOperator)
        {
            var inScope = await db.EventMembershipRooms
                .AnyAsync(emr => emr.EventMembershipId == membership.Id && emr.RoomId == roomId);
            if (!inScope) throw new HubException("Forbidden");
        }
    }

    private async Task<Snapshot> InvokeAsync(Func<Guid, Task<TimerOperationResult>> command, Guid roomId)
    {
        EnsureTenantContext();
        var userId = RequireOperator();
        await EnsureRoomAccessAsync(roomId, EventRole.RoomOperator);

        var result = await command(userId);
        if (!result.IsSuccess) throw new HubException($"{result.Outcome}");
        var snapshot = result.Snapshot!;
        await Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snapshot);
        var eventId = await db.Rooms.Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync();
        await Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snapshot);
        await Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snapshot);
        return snapshot;
    }

    private string SurfaceFromQuery()
    {
        var surface = Context.GetHttpContext()?.Request.Query["surface"].ToString().ToLowerInvariant();
        return surface is "speaker" or "door" ? surface : "other";
    }

    private void RegisterPresence(string key)
    {
        Presence.AddOrUpdate(key, 1, (_, n) => n + 1);
        if (!Context.Items.TryGetValue("presenceKeys", out var raw) || raw is not List<string> keys)
        {
            keys = [];
            Context.Items["presenceKeys"] = keys;
        }
        keys.Add(key);
    }

    private static void DecrementPresence(string key)
    {
        Presence.AddOrUpdate(key, 0, (_, n) => Math.Max(0, n - 1));
        if (Presence.TryGetValue(key, out var count) && count <= 0)
            Presence.TryRemove(key, out _);
    }

    private async Task BroadcastPresenceAsync(Guid eventId)
    {
        var presence = await BuildPresenceAsync(eventId);
        await Clients.Group(HubGroups.EventControl(eventId)).SendAsync("DisplayPresenceChanged", eventId, presence);
    }

    private async Task<DisplayPresenceDto> BuildPresenceAsync(Guid eventId)
    {
        var roomIds = await db.Rooms.Where(r => r.EventId == eventId).Select(r => r.Id).ToListAsync();
        var rooms = roomIds.ToDictionary(
            id => id,
            id => new RoomDisplayPresenceDto(
                Speaker: Presence.GetValueOrDefault(PresenceKeyForRoom(id, "speaker")),
                Door: Presence.GetValueOrDefault(PresenceKeyForRoom(id, "door")),
                Other: Presence.GetValueOrDefault(PresenceKeyForRoom(id, "other"))));
        return new DisplayPresenceDto(Presence.GetValueOrDefault(PresenceKeyForLobby(eventId)), rooms);
    }

    private static string PresenceKeyForRoom(Guid roomId, string surface) => $"room:{roomId}:{surface}";
    private static string PresenceKeyForLobby(Guid eventId) => $"event:{eventId}:lobby";

    // Suppress unused-parameter warning for `clock` until it's wired into a future feature.
    private void _SuppressUnused() => _ = clock;
}
