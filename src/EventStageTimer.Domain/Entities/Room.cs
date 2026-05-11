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
    /// <summary>
    /// JSON-encoded configuration for the public Door display next to the room. Shape is
    /// validated client-side; the server treats it as an opaque blob it surfaces back via
    /// the public /r/{code}/info endpoint and accepts via the admin door-config endpoint.
    /// Default "{}" → DoorView falls back to its built-in defaults.
    /// </summary>
    public string DoorDisplayConfigJson { get; set; } = "{}";
    /// <summary>Optional programme the room is bound to. When set, the room's schedule
    /// editor surfaces the programme's slots so sessions can attach without re-typing times.</summary>
    public Guid? ProgrammeId { get; set; }
    public Programme? Programme { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ScheduleItem> ScheduleItems { get; set; } = [];
    public RoomTimerState? TimerState { get; set; }
}
