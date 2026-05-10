namespace EventStageTimer.Domain.Entities;

public class Invitation
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Email { get; set; }
    public EventRole Role { get; set; }
    public required string Token { get; set; } // URL-safe random
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public bool EmailSendFailed { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<InvitationRoom> ScopedRooms { get; set; } = [];
}
