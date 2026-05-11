namespace EventStageTimer.Domain.Entities;

/// <summary>
/// Event-level high-level time schedule (a "programme" or "agenda template"). Each
/// programme contains an ordered list of <see cref="ProgrammeSlot"/>s with absolute
/// start times. A <see cref="Room"/> may optionally bind to one programme; in that
/// case its <see cref="ScheduleItem"/>s may optionally attach to slots.
/// </summary>
public class Programme
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Name { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ProgrammeSlot> Slots { get; set; } = [];
}
