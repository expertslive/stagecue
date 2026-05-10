namespace EventStageTimer.Domain.Entities;

public class AuthMagicLink
{
    public string Token { get; set; } = null!; // PK; URL-safe random, ≥32 bytes base64
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}
