using EventStageTimer.Domain.Timer;

namespace EventStageTimer.Infrastructure.Timer;

public interface ITimerCommandService
{
    Task<TimerOperationResult> StartItemAsync(Guid roomId, Guid scheduleItemId, RunTriggerKind trigger, long? expectedVersion, Guid? userId, CancellationToken ct);
    Task<TimerOperationResult> StartAutoAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> PauseAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> ResumeAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> StopAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> ResetAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SkipNextAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> AdjustTimeAsync(Guid roomId, int deltaSec, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SetExactRemainingAsync(Guid roomId, int remainingSec, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SetMessageAsync(Guid roomId, string? message, Guid userId, CancellationToken ct); // unversioned, last-write-wins
    Task<TimerOperationResult> ExpirePreRollAsync(Guid roomId, CancellationToken ct); // scheduler-driven, unversioned
    Task<Snapshot?> GetSnapshotAsync(Guid roomId, CancellationToken ct);
}

public enum RunTriggerKind { Operator = 1, Scheduler = 2, Skip = 3 }
