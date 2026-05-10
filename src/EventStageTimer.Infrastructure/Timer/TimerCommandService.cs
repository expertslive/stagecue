using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Timer;

public sealed class TimerCommandService(AppDbContext db, IClock clock) : ITimerCommandService
{
    public async Task<Snapshot?> GetSnapshotAsync(Guid roomId, CancellationToken ct)
    {
        var state = await db.RoomTimerStates
            .Include(s => s.CurrentItem)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        return state is null ? null : await BuildSnapshotAsync(state, ct);
    }

    public async Task<TimerOperationResult> StartItemAsync(
        Guid roomId, Guid scheduleItemId, RunTriggerKind trigger, long? expectedVersion, Guid? userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.RoomTimerStates
            .Include(s => s.CurrentItem)
            .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        if (state is null) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);

        if (expectedVersion is { } expected && BitConverter.ToInt64(state.Version, 0) != expected)
            return TimerOperationResult.Fail(TimerOperationOutcome.StaleVersion);

        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == scheduleItemId && s.RoomId == roomId, ct);
        if (item is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);

        var sm = TimerStateMachine.StartItem(state, item, clock.UtcNow);
        if (sm.IsFailure) return TimerOperationResult.Fail(MapError(sm.Error));

        var nextRunNumber = await db.ScheduleItemRuns
            .Where(r => r.ScheduleItemId == item.Id)
            .Select(r => (int?)r.RunNumber).MaxAsync(ct) ?? 0;
        var run = new ScheduleItemRun
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            ScheduleItemId = item.Id,
            RunNumber = nextRunNumber + 1,
            Trigger = (RunTrigger)(int)trigger,
            StartedAtUtc = clock.UtcNow,
        };
        db.ScheduleItemRuns.Add(run);
        state.CurrentRunId = run.Id;

        Audit(state, userId, trigger == RunTriggerKind.Scheduler ? "AutoStart" : "Start",
            $"{{\"scheduleItemId\":\"{item.Id}\",\"trigger\":\"{trigger}\"}}");

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return TimerOperationResult.Ok((await BuildSnapshotAsync(state, ct))!);
    }

    public async Task<TimerOperationResult> StartAutoAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);

        var now = clock.UtcNow;
        var candidate = await db.ScheduleItems
            .Where(s => s.RoomId == roomId
                     && !s.Runs.Any(r => r.EndedAtUtc != null)
                     && s.ScheduledStartUtc >= now.AddMinutes(-30))
            .OrderBy(s => s.Position)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(ct);
        candidate ??= await db.ScheduleItems
            .Where(s => s.RoomId == roomId && !s.Runs.Any())
            .OrderBy(s => s.Position)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(ct);
        if (candidate is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);

        return await StartItemAsync(roomId, candidate.Value, RunTriggerKind.Operator, expectedVersion, userId, ct);
    }

    public async Task<TimerOperationResult> PauseAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);
        var r = TimerStateMachine.Pause(state, clock.UtcNow);
        if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
        Audit(state, userId, "Pause", "{}");
        return await PersistAndReturnAsync(state, ct);
    }

    public async Task<TimerOperationResult> ResumeAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);
        var r = TimerStateMachine.Resume(state, clock.UtcNow);
        if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
        Audit(state, userId, "Resume", "{}");
        return await PersistAndReturnAsync(state, ct);
    }

    public async Task<TimerOperationResult> StopAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);
        var r = TimerStateMachine.Stop(state);
        if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));

        if (state.CurrentRunId is { } runId)
        {
            var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
            if (run is not null)
            {
                run.EndedAtUtc = clock.UtcNow;
                run.EndedReason = RunEndedReason.Stop;
            }
            state.CurrentRunId = null;
        }
        Audit(state, userId, "Stop", "{}");
        return await PersistAndReturnAsync(state, ct);
    }

    public async Task<TimerOperationResult> ResetAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);

        if (state.CurrentRunId is { } runId)
        {
            var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
            if (run is not null)
            {
                run.EndedAtUtc = clock.UtcNow;
                run.EndedReason = RunEndedReason.Reset;
            }
            state.CurrentRunId = null;
        }

        TimerStateMachine.Reset(state);
        Audit(state, userId, "Reset", "{}");
        return await PersistAndReturnAsync(state, ct);
    }

    public async Task<TimerOperationResult> SkipNextAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);

        Guid? nextItemId = null;
        if (state.CurrentItem is not null)
        {
            nextItemId = await db.ScheduleItems
                .Where(s => s.RoomId == roomId && s.Position > state.CurrentItem.Position
                            && !s.Runs.Any(r => r.EndedAtUtc != null))
                .OrderBy(s => s.Position)
                .Select(s => (Guid?)s.Id)
                .FirstOrDefaultAsync(ct);
        }
        if (nextItemId is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoNextItem);

        if (state.CurrentRunId is { } runId)
        {
            var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
            if (run is not null)
            {
                run.EndedAtUtc = clock.UtcNow;
                run.EndedReason = RunEndedReason.SkipReplaced;
            }
            state.CurrentRunId = null;
        }

        // Force phase to Idle so StartItem precondition is met
        state.Phase = TimerPhase.Idle;

        var nextItem = await db.ScheduleItems.FirstAsync(x => x.Id == nextItemId.Value, ct);
        var sm = TimerStateMachine.StartItem(state, nextItem, clock.UtcNow);
        if (sm.IsFailure) return TimerOperationResult.Fail(MapError(sm.Error));

        var nextRunNumber = await db.ScheduleItemRuns.Where(r => r.ScheduleItemId == nextItem.Id).Select(r => (int?)r.RunNumber).MaxAsync(ct) ?? 0;
        var newRun = new ScheduleItemRun
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            ScheduleItemId = nextItem.Id,
            RunNumber = nextRunNumber + 1,
            Trigger = RunTrigger.Skip,
            StartedAtUtc = clock.UtcNow,
        };
        db.ScheduleItemRuns.Add(newRun);
        state.CurrentRunId = newRun.Id;

        Audit(state, userId, "SkipNext", $"{{\"nextItemId\":\"{nextItem.Id}\"}}");

        var saved = await PersistAndReturnAsync(state, ct);
        await tx.CommitAsync(ct);
        return saved;
    }

    public async Task<TimerOperationResult> AdjustTimeAsync(Guid roomId, int deltaSec, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);
        var r = TimerStateMachine.AdjustTime(state, deltaSec);
        if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
        Audit(state, userId, "AdjustTime", $"{{\"deltaSec\":{deltaSec}}}");
        return await PersistAndReturnAsync(state, ct);
    }

    public async Task<TimerOperationResult> SetExactRemainingAsync(Guid roomId, int remainingSec, long expectedVersion, Guid userId, CancellationToken ct)
    {
        var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
        if (state is null) return TimerOperationResult.Fail(fail!.Value);
        if (state.CurrentItem is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);
        var r = TimerStateMachine.SetExactRemaining(state, state.CurrentItem, remainingSec, clock.UtcNow);
        if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
        Audit(state, userId, "SetExactRemaining", $"{{\"remainingSec\":{remainingSec}}}");
        return await PersistAndReturnAsync(state, ct);
    }

    /// <summary>
    /// Last-write-wins. Bypasses optimistic concurrency on Version because the spec (§4.5)
    /// requires that message updates do NOT invalidate concurrent state commands. ExecuteUpdateAsync
    /// writes the column without loading the row, so SQL Server doesn't bump rowversion.
    /// </summary>
    public async Task<TimerOperationResult> SetMessageAsync(Guid roomId, string? message, Guid userId, CancellationToken ct)
    {
        var rows = await db.RoomTimerStates
            .Where(s => s.RoomId == roomId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.CurrentMessage, _ => message), ct);
        if (rows == 0) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);

        var state = await db.RoomTimerStates.AsNoTracking().FirstAsync(s => s.RoomId == roomId, ct);
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            RoomId = roomId,
            UserId = userId,
            Action = string.IsNullOrEmpty(message) ? "ClearMessage" : "SetMessage",
            DetailsJson = message is null ? "{}" : $"{{\"length\":{message.Length}}}",
            AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        var snapshot = await GetSnapshotAsync(roomId, ct);
        return TimerOperationResult.Ok(snapshot!);
    }

    public async Task<TimerOperationResult> ExpirePreRollAsync(Guid roomId, CancellationToken ct)
    {
        var state = await db.RoomTimerStates.Include(s => s.CurrentItem).FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        if (state is null) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);
        if (state.Phase != TimerPhase.PreRoll) return TimerOperationResult.Fail(TimerOperationOutcome.InvalidPhase);

        TimerStateMachine.ExpirePreRoll(state, clock.UtcNow);
        Audit(state, userId: null, "PreRollExpired", "{}");
        return await PersistAndReturnAsync(state, ct);
    }

    private async Task<(RoomTimerState? state, TimerOperationOutcome? failure)> LoadForCommandAsync(
        Guid roomId, long expectedVersion, CancellationToken ct)
    {
        var state = await db.RoomTimerStates
            .Include(s => s.CurrentItem)
            .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        if (state is null) return (null, TimerOperationOutcome.NotFound);
        if (BitConverter.ToInt64(state.Version, 0) != expectedVersion)
            return (null, TimerOperationOutcome.StaleVersion);
        return (state, null);
    }

    private async Task<TimerOperationResult> PersistAndReturnAsync(RoomTimerState state, CancellationToken ct)
    {
        await db.SaveChangesAsync(ct);
        var snapshot = await BuildSnapshotAsync(state, ct);
        return TimerOperationResult.Ok(snapshot!);
    }

    private void Audit(RoomTimerState state, Guid? userId, string action, string detailsJson)
    {
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            RoomId = state.RoomId,
            UserId = userId,
            Action = action,
            DetailsJson = detailsJson,
            AtUtc = clock.UtcNow,
        });
    }

    private async Task<Snapshot?> BuildSnapshotAsync(RoomTimerState s, CancellationToken ct)
    {
        SnapshotItem? cur = null;
        if (s.CurrentItem is not null)
            cur = new SnapshotItem(
                s.CurrentItem.Id, s.CurrentItem.Title, s.CurrentItem.SpeakerName,
                s.CurrentItem.ScheduledStartUtc, s.CurrentItem.DurationSec, s.CurrentItem.PreRollSec,
                ThresholdParser.Parse(s.CurrentItem.ThresholdsJson));

        SnapshotNextItem? next = null;
        if (s.CurrentItem is not null)
        {
            var n = await db.ScheduleItems
                .Where(x => x.RoomId == s.RoomId && x.Position > s.CurrentItem.Position)
                .OrderBy(x => x.Position)
                .Select(x => new { x.Id, x.Title, x.ScheduledStartUtc })
                .FirstOrDefaultAsync(ct);
            if (n is not null) next = new SnapshotNextItem(n.Id, n.Title, n.ScheduledStartUtc);
        }

        int? pauseRemainingMs = null;
        if (s.Phase == TimerPhase.Paused && s.StartedAtUtc is not null && s.CurrentItem is not null && s.PauseStartedAtUtc is not null)
        {
            var elapsed = (s.PauseStartedAtUtc.Value - s.StartedAtUtc.Value).TotalSeconds - s.PausedAccumSec;
            pauseRemainingMs = (int)((s.CurrentItem.DurationSec + s.AdjustmentSec - elapsed) * 1000);
        }

        return new Snapshot(
            s.RoomId, cur, s.CurrentRunId, next, s.Phase,
            s.StartedAtUtc, s.PreRollEndsAtUtc, s.PauseStartedAtUtc,
            s.PausedAccumSec, s.AdjustmentSec, pauseRemainingMs,
            s.CurrentMessage, clock.UtcNow,
            BitConverter.ToInt64(s.Version, 0));
    }

    private static TimerOperationOutcome MapError(TimerCommandError e) => e switch
    {
        TimerCommandError.InvalidPhase => TimerOperationOutcome.InvalidPhase,
        TimerCommandError.AdjustmentOutOfBounds => TimerOperationOutcome.AdjustmentOutOfBounds,
        TimerCommandError.NoActiveItem => TimerOperationOutcome.NoActiveItem,
        TimerCommandError.NoNextItem => TimerOperationOutcome.NoNextItem,
        _ => TimerOperationOutcome.InvalidPhase,
    };
}
