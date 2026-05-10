using EventStageTimer.Api.Hubs;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
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
        // Discovery scope: cross-tenant scan for due triggers. Uses IgnoreQueryFilters
        // intentionally because the scheduler is a system-scoped background service
        // and dispatches per-item to a fresh tenant-scoped sub-scope below.
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var nowUtc = clock.UtcNow;

        // 1. Auto-start due items
        var dueItems = await db.ScheduleItems
            .IgnoreQueryFilters()
            .Include(s => s.Room).ThenInclude(r => r.TimerState)
            .Where(s => s.AutoStart
                     && s.Room.TimerState!.Phase == TimerPhase.Idle
                     && s.ScheduledStartUtc.AddSeconds(-s.PreRollSec) <= nowUtc
                     && !s.Runs.Any())
            .Select(s => new DueItem(s.TenantId, s.RoomId, s.Id, s.Room.TimerState!.Version))
            .ToListAsync(ct);

        foreach (var item in dueItems)
        {
            log.LogInformation("Auto-starting item {ItemId} in room {RoomId}", item.ItemId, item.RoomId);
            await DispatchInTenantScopeAsync(item.TenantId, async (commands) =>
            {
                var result = await commands.StartItemAsync(item.RoomId, item.ItemId, RunTriggerKind.Scheduler, item.Version, userId: null, ct);
                if (result.IsSuccess && result.Snapshot is not null)
                    await BroadcastAsync(item.RoomId, result.Snapshot, ct);
            }, ct);
        }

        // 2. Expire pre-rolls
        var expired = await db.RoomTimerStates
            .IgnoreQueryFilters()
            .Where(s => s.Phase == TimerPhase.PreRoll && s.PreRollEndsAtUtc != null && s.PreRollEndsAtUtc <= nowUtc)
            .Select(s => new ExpiredPreRoll(s.TenantId, s.RoomId))
            .ToListAsync(ct);

        foreach (var ex in expired)
        {
            await DispatchInTenantScopeAsync(ex.TenantId, async (commands) =>
            {
                var result = await commands.ExpirePreRollAsync(ex.RoomId, ct);
                if (result.IsSuccess && result.Snapshot is not null)
                    await BroadcastAsync(ex.RoomId, result.Snapshot, ct);
            }, ct);
        }
    }

    private async Task DispatchInTenantScopeAsync(Guid tenantId, Func<ITimerCommandService, Task> action, CancellationToken ct)
    {
        // Fresh DI scope per dispatched command so that the per-scope ITenantContext
        // can be set to the item's tenant once and never reassigned (TenantContext.Set
        // throws on reassignment by design).
        await using var scope = scopes.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<ITenantContext>().Set(tenantId);
        var commands = scope.ServiceProvider.GetRequiredService<ITimerCommandService>();
        await action(commands);
        _ = ct;
    }

    private async Task BroadcastAsync(Guid roomId, EventStageTimer.Domain.Timer.Snapshot snap, CancellationToken ct)
    {
        // Cross-tenant lookup of the parent event id for group routing — system scope.
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var eventId = await db.Rooms.IgnoreQueryFilters()
            .Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync(ct);
        await hub.Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snap, ct);
        await hub.Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snap, ct);
        await hub.Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snap, ct);
    }

    private sealed record DueItem(Guid TenantId, Guid RoomId, Guid ItemId, long Version);
    private sealed record ExpiredPreRoll(Guid TenantId, Guid RoomId);
}
