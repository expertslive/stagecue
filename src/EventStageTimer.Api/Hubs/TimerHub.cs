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
using System.Security.Claims;

namespace EventStageTimer.Api.Hubs;

internal static class HubGroups
{
    public static string Room(Guid roomId) => $"room:{roomId}";
    public static string EventLobby(Guid eventId) => $"event-lobby:{eventId}";
    public static string EventControl(Guid eventId) => $"event-control:{eventId}";
}

[Authorize(AuthenticationSchemes = IdentitySetup.SchemeName + "," + PublicAccessCodeAuthHandler.SchemeName)]
public sealed class TimerHub(
    AppDbContext db,
    ITimerCommandService commands,
    PublicAccessContext publicCtx,
    ITenantContext tenantContext,
    IClock clock) : Hub
{
    /// <summary>
    /// SignalR creates a fresh DI scope per hub method invocation, so the request-scoped
    /// <see cref="ITenantContext"/> arrives empty. We rebuild it from the authenticated
    /// user's <c>tid</c> claim (or the public access code's resolved tenant) before
    /// touching the DB so EF's strict tenant filter applies correctly.
    /// </summary>
    private void EnsureTenantContext()
    {
        if (tenantContext.TenantId.HasValue) return;
        if (publicCtx.TenantId is { } publicTenant) { tenantContext.Set(publicTenant); return; }
        var tid = Context.User?.FindFirstValue("tid");
        if (Guid.TryParse(tid, out var fromClaim)) tenantContext.Set(fromClaim);
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
            var snap = await commands.GetSnapshotAsync(pubRoom, Context.ConnectionAborted);
            if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
        }
        if (publicCtx.IsLobbyCode && publicCtx.EventId is { } pubEvent)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.EventLobby(pubEvent));
            var lobbyRooms = await db.Rooms.Where(r => r.EventId == pubEvent).Select(r => r.Id).ToListAsync();
            foreach (var rid in lobbyRooms)
            {
                var snap = await commands.GetSnapshotAsync(rid, Context.ConnectionAborted);
                if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
            }
        }

        await base.OnConnectedAsync();
    }

    /// <summary>Returns the current snapshot for a room. Caller must have at least Viewer-level access (or be the public-code client for this room).</summary>
    public async Task<Snapshot?> Resync(Guid roomId)
    {
        EnsureTenantContext();
        if (publicCtx.RoomId == roomId)
            return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);

        await EnsureRoomAccessAsync(roomId, EventRole.Viewer);
        return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);
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

    // Suppress unused-parameter warning for `clock` until it's wired into a future feature.
    private void _SuppressUnused() => _ = clock;
}
