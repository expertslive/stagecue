namespace EventStageTimer.Domain.Entities;

/// <summary>
/// One time slot within a <see cref="Programme"/>. Slots are absolute (have a real
/// UTC start time); the operator binds a session/<see cref="ScheduleItem"/> to a slot
/// and the session inherits the slot's start + duration. Cascade-on-edit behaviour is
/// chosen by the admin per save.
/// </summary>
public class ProgrammeSlot
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ProgrammeId { get; set; }
    public Programme Programme { get; set; } = null!;

    public int Position { get; set; }
    public required string Label { get; set; }
    public DateTime StartUtc { get; set; }
    public int DurationSec { get; set; }

    public DateTime CreatedAtUtc { get; set; }
}
