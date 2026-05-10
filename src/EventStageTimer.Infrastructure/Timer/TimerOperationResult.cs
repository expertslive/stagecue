using EventStageTimer.Domain.Timer;

namespace EventStageTimer.Infrastructure.Timer;

public enum TimerOperationOutcome
{
    Ok = 0,
    StaleVersion = 1,
    InvalidPhase = 2,
    AdjustmentOutOfBounds = 3,
    NoActiveItem = 4,
    NoNextItem = 5,
    NotFound = 6,
}

public sealed record TimerOperationResult(TimerOperationOutcome Outcome, Snapshot? Snapshot, string? Message = null)
{
    public bool IsSuccess => Outcome == TimerOperationOutcome.Ok;
    public static TimerOperationResult Ok(Snapshot s) => new(TimerOperationOutcome.Ok, s);
    public static TimerOperationResult Fail(TimerOperationOutcome o, string? msg = null) => new(o, null, msg);
}
