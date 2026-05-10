namespace EventStageTimer.Domain.Entities;

public enum EventRole
{
    EventAdmin = 1,
    RoomOperator = 2,
    Viewer = 3,
}

public class EventMembership
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public EventRole Role { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<EventMembershipRoom> ScopedRooms { get; set; } = [];
}
