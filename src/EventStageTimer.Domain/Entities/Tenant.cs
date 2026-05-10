namespace EventStageTimer.Domain.Entities;

public enum TenantMode
{
    SaaS = 1,
    SelfHost = 2,
}

public class Tenant
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public TenantMode Mode { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
}
