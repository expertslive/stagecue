namespace EventStageTimer.Infrastructure.Tenancy;

public sealed class TenantContext : ITenantContext
{
    public Guid? TenantId { get; private set; }
    public void Set(Guid tenantId)
    {
        if (TenantId is { } existing && existing != tenantId)
            throw new InvalidOperationException($"TenantContext already set to {existing}; cannot change to {tenantId}");
        TenantId = tenantId;
    }
}
