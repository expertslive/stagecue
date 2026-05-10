namespace EventStageTimer.Domain.Entities;

public enum TenantRole
{
    Owner = 1,
    Admin = 2,
}

public class TenantMembership
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public TenantRole Role { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
