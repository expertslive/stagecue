namespace EventStageTimer.Domain.Entities;

public class AuthMagicLink
{
    /// <summary>
    /// SHA-256 hash (base64url) of the URL-safe random token. The raw token is only ever
    /// known to the recipient (via the email link); a DB compromise yields hashes, not
    /// working credentials.
    /// </summary>
    public string TokenHash { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}
