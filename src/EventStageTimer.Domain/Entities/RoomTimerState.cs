namespace EventStageTimer.Domain.Entities;

public class RoomTimerState
{
    public Guid RoomId { get; set; } // PK
    public Room Room { get; set; } = null!;
    public Guid TenantId { get; set; }
    public Guid? CurrentItemId { get; set; }
    public ScheduleItem? CurrentItem { get; set; }
    public Guid? CurrentRunId { get; set; }
    public ScheduleItemRun? CurrentRun { get; set; }
    public TimerPhase Phase { get; set; } = TimerPhase.Idle;
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? PreRollEndsAtUtc { get; set; }
    public DateTime? PauseStartedAtUtc { get; set; }
    public int PausedAccumSec { get; set; }
    public int AdjustmentSec { get; set; }
    public string? CurrentMessage { get; set; }
    // SQL Server rowversion (8 bytes). Mapped via [Timestamp] in the EF config.
    public byte[] Version { get; set; } = [];
}
