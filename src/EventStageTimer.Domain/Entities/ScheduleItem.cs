namespace EventStageTimer.Domain.Entities;

public class ScheduleItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public int Position { get; set; }
    public required string Title { get; set; }
    public string? SpeakerName { get; set; }
    public DateTime ScheduledStartUtc { get; set; }
    public int DurationSec { get; set; }
    public int PreRollSec { get; set; }
    public bool AutoStart { get; set; }
    public string? ThresholdsJson { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ScheduleItemRun> Runs { get; set; } = [];
}
