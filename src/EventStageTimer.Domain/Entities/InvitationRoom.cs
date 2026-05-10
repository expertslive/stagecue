namespace EventStageTimer.Domain.Entities;

public class InvitationRoom
{
    public Guid InvitationId { get; set; }
    public Invitation Invitation { get; set; } = null!;
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
}
