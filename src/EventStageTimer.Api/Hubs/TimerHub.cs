using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
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
    IClock clock) : Hub
{
    public override async Task OnConnectedAsync()
    {
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

    /// <summary>Returns the current snapshot for a room. Caller must be in the room's group.</summary>
    public async Task<Snapshot?> Resync(Guid roomId)
    {
        var canSee = (publicCtx.RoomId == roomId)
                  || (Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) is { } uid
                      && Guid.TryParse(uid, out var userId)
                      && await db.Rooms.AnyAsync(r => r.Id == roomId && r.Event.Memberships.Any(m => m.UserId == userId)));
        if (!canSee) throw new HubException("Forbidden");
        return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);
    }

    // -------- State-changing methods (versioned) --------

    public Task<Snapshot> StartAuto(Guid roomId, long version) =>
        InvokeAsync(() => commands.StartAutoAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> StartItem(Guid roomId, Guid scheduleItemId, long version) =>
        InvokeAsync(() => commands.StartItemAsync(roomId, scheduleItemId, RunTriggerKind.Operator, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Pause(Guid roomId, long version) =>
        InvokeAsync(() => commands.PauseAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Resume(Guid roomId, long version) =>
        InvokeAsync(() => commands.ResumeAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Stop(Guid roomId, long version) =>
        InvokeAsync(() => commands.StopAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Reset(Guid roomId, long version) =>
        InvokeAsync(() => commands.ResetAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> SkipNext(Guid roomId, long version) =>
        InvokeAsync(() => commands.SkipNextAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> AdjustTime(Guid roomId, int deltaSec, long version) =>
        InvokeAsync(() => commands.AdjustTimeAsync(roomId, deltaSec, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> SetExactRemaining(Guid roomId, int remainingSec, long version) =>
        InvokeAsync(() => commands.SetExactRemainingAsync(roomId, remainingSec, version, RequireOperator(), Context.ConnectionAborted), roomId);

    // -------- Unversioned message methods (last-write-wins) --------

    public async Task<Snapshot> SetMessage(Guid roomId, string? message)
    {
        var userId = RequireOperator();
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

    private async Task<Snapshot> InvokeAsync(Func<Task<TimerOperationResult>> command, Guid roomId)
    {
        var result = await command();
        if (!result.IsSuccess) throw new HubException($"{result.Outcome}");
        var snapshot = result.Snapshot!;
        await Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snapshot);
        var eventId = await db.Rooms.Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync();
        await Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snapshot);
        await Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snapshot);
        return snapshot;
    }
}
