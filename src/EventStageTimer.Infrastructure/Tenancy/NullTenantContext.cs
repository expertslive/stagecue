namespace EventStageTimer.Infrastructure.Tenancy;

/// <summary>Used by EF design-time tooling and tests that don't need tenant scoping.</summary>
public sealed class NullTenantContext : ITenantContext
{
    public Guid? TenantId { get; private set; }
    public void Set(Guid tenantId) => TenantId = tenantId;
}
