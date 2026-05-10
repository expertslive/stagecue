using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;

namespace EventStageTimer.Domain.Timer;

/// <summary>
/// Pure functions that mutate a <see cref="RoomTimerState"/> per the spec's transition table.
/// No I/O — all DB writes happen in the calling service. <see cref="ScheduleItemRun"/> rows
/// are created/closed by the caller.
/// </summary>
public static class TimerStateMachine
{
    private const int MaxAdjustmentSec = 24 * 3600;
    private const int MinAdjustmentSec = -24 * 3600;

    public static Result<Unit, TimerCommandError> StartItem(RoomTimerState state, ScheduleItem item, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Idle)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);

        state.CurrentItemId = item.Id;
        state.AdjustmentSec = 0;
        state.PausedAccumSec = 0;
        state.PauseStartedAtUtc = null;

        if (item.PreRollSec > 0)
        {
            state.Phase = TimerPhase.PreRoll;
            state.PreRollEndsAtUtc = nowUtc.AddSeconds(item.PreRollSec);
            state.StartedAtUtc = null;
        }
        else
        {
            state.Phase = TimerPhase.Running;
            state.StartedAtUtc = nowUtc;
            state.PreRollEndsAtUtc = null;
        }
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static void ExpirePreRoll(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.PreRoll || state.PreRollEndsAtUtc is null) return;
        // Use the intended expiry timestamp, not nowUtc — avoids drift from 1Hz tick.
        state.StartedAtUtc = state.PreRollEndsAtUtc.Value;
        state.PreRollEndsAtUtc = null;
        state.Phase = TimerPhase.Running;
    }

    public static Result<Unit, TimerCommandError> Pause(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Running)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        state.PauseStartedAtUtc = nowUtc;
        state.Phase = TimerPhase.Paused;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> Resume(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Paused || state.PauseStartedAtUtc is null)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        var pausedFor = (int)(nowUtc - state.PauseStartedAtUtc.Value).TotalSeconds;
        state.PausedAccumSec += pausedFor;
        state.PauseStartedAtUtc = null;
        state.Phase = TimerPhase.Running;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> Stop(RoomTimerState state)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        state.Phase = TimerPhase.Ended;
        state.StartedAtUtc = null;
        state.PausedAccumSec = 0;
        state.AdjustmentSec = 0;
        state.PauseStartedAtUtc = null;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static void Reset(RoomTimerState state)
    {
        state.Phase = TimerPhase.Idle;
        state.StartedAtUtc = null;
        state.PreRollEndsAtUtc = null;
        state.PauseStartedAtUtc = null;
        state.PausedAccumSec = 0;
        state.AdjustmentSec = 0;
        state.CurrentMessage = null;
        // CurrentItemId preserved per spec §6.2
    }

    public static Result<Unit, TimerCommandError> AdjustTime(RoomTimerState state, int deltaSec)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        var proposed = state.AdjustmentSec + deltaSec;
        if (proposed < MinAdjustmentSec || proposed > MaxAdjustmentSec)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.AdjustmentOutOfBounds);
        state.AdjustmentSec = proposed;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> SetExactRemaining(
        RoomTimerState state, ScheduleItem currentItem, int remainingSec, DateTime nowUtc)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        if (state.StartedAtUtc is null) return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);

        // While Paused, the open pause window is NOT yet folded into PausedAccumSec
        // (that happens on Resume). Use PauseStartedAtUtc as the "frozen now" so the
        // elapsed calculation matches what the speaker view is displaying.
        var referenceNow = state.Phase == TimerPhase.Paused && state.PauseStartedAtUtc is { } p
            ? p
            : nowUtc;
        var elapsed = (referenceNow - state.StartedAtUtc.Value).TotalSeconds - state.PausedAccumSec;
        var currentEffectiveTotal = currentItem.DurationSec + state.AdjustmentSec;
        var currentRemaining = currentEffectiveTotal - elapsed;
        var delta = remainingSec - (int)currentRemaining;
        return AdjustTime(state, delta);
    }
}

public readonly record struct Unit
{
    public static readonly Unit Value = default;
}
