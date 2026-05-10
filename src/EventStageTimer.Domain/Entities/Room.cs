namespace EventStageTimer.Domain.Entities;

public class Room
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Name { get; set; }
    public string AccessCode { get; set; } = null!; // 8 chars, no dash
    public int DefaultPreRollSec { get; set; } = 30;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ScheduleItem> ScheduleItems { get; set; } = [];
    public RoomTimerState? TimerState { get; set; }
}
