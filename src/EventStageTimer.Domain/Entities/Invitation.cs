namespace EventStageTimer.Domain.Entities;

public class Invitation
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Email { get; set; }
    public EventRole Role { get; set; }
    /// <summary>
    /// SHA-256 hash (base64url) of the URL-safe random token. The raw token is only sent
    /// in the invitation email link; a DB read does not yield a working credential.
    /// </summary>
    public required string TokenHash { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public bool EmailSendFailed { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<InvitationRoom> ScopedRooms { get; set; } = [];
}
