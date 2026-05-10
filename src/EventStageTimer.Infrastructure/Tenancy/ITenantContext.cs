namespace EventStageTimer.Infrastructure.Tenancy;

/// <summary>Resolved tenant for the current request or background scope. Empty means "no tenant" (e.g. anonymous public lookup) — query filters then reject access to tenant-scoped tables.</summary>
public interface ITenantContext
{
    Guid? TenantId { get; }
    void Set(Guid tenantId);
}
