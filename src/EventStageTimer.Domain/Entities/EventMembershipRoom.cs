namespace EventStageTimer.Domain.Entities;

public class EventMembershipRoom
{
    public Guid EventMembershipId { get; set; }
    public EventMembership EventMembership { get; set; } = null!;
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
}
