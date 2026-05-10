using EventStageTimer.Domain.Entities;

namespace EventStageTimer.Domain.Timer;

public sealed record SnapshotItem(Guid Id, string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, IReadOnlyList<Threshold> Thresholds);
public sealed record SnapshotNextItem(Guid Id, string Title, DateTime ScheduledStartUtc);

public sealed record Snapshot(
    Guid RoomId,
    SnapshotItem? CurrentItem,
    Guid? CurrentRunId,
    SnapshotNextItem? NextItem,
    TimerPhase Phase,
    DateTime? StartedAtUtc,
    DateTime? PreRollEndsAtUtc,
    DateTime? PauseStartedAtUtc,
    int PausedAccumSec,
    int AdjustmentSec,
    int? PauseRemainingMs,
    string? CurrentMessage,
    DateTime ServerNowUtc,
    long Version);
