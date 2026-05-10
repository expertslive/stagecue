using EventStageTimer.Api.Hubs;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Timer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.BackgroundServices;

public sealed class SchedulerService(
    IServiceScopeFactory scopes,
    IClock clock,
    ILogger<SchedulerService> log,
    IHubContext<TimerHub> hub) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        log.LogInformation("SchedulerService started");
        var period = TimeSpan.FromSeconds(1);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogWarning(ex, "Scheduler tick failed"); }
            try { await Task.Delay(period, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var commands = scope.ServiceProvider.GetRequiredService<ITimerCommandService>();
        var nowUtc = clock.UtcNow;

        // 1. Auto-start due items (pre-roll start)
        var dueItems = await db.ScheduleItems
            .IgnoreQueryFilters() // system scope across tenants
            .Include(s => s.Room).ThenInclude(r => r.TimerState)
            .Where(s => s.AutoStart
                     && s.Room.TimerState!.Phase == TimerPhase.Idle
                     && s.ScheduledStartUtc.AddSeconds(-s.PreRollSec) <= nowUtc
                     && !s.Runs.Any())
            .ToListAsync(ct);

        foreach (var item in dueItems)
        {
            log.LogInformation("Auto-starting item {ItemId} in room {RoomId}", item.Id, item.RoomId);
            var version = item.Room.TimerState!.Version;
            var result = await commands.StartItemAsync(item.RoomId, item.Id, RunTriggerKind.Scheduler, version, userId: null, ct);
            if (result.IsSuccess && result.Snapshot is not null)
                await BroadcastAsync(db, item.RoomId, result.Snapshot, ct);
        }

        // 2. Expire pre-rolls
        var expired = await db.RoomTimerStates
            .IgnoreQueryFilters()
            .Where(s => s.Phase == TimerPhase.PreRoll && s.PreRollEndsAtUtc != null && s.PreRollEndsAtUtc <= nowUtc)
            .Select(s => s.RoomId)
            .ToListAsync(ct);

        foreach (var roomId in expired)
        {
            var result = await commands.ExpirePreRollAsync(roomId, ct);
            if (result.IsSuccess && result.Snapshot is not null)
                await BroadcastAsync(db, roomId, result.Snapshot, ct);
        }
    }

    private async Task BroadcastAsync(AppDbContext db, Guid roomId, EventStageTimer.Domain.Timer.Snapshot snap, CancellationToken ct)
    {
        await hub.Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snap, ct);
        var eventId = await db.Rooms.IgnoreQueryFilters().Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync(ct);
        await hub.Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snap, ct);
        await hub.Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snap, ct);
    }
}
