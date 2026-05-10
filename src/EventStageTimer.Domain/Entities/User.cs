using Microsoft.AspNetCore.Identity;

namespace EventStageTimer.Domain.Entities;

public class User : IdentityUser<Guid>
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    // Many-to-many to Tenants via TenantMembership
    public ICollection<TenantMembership> TenantMemberships { get; set; } = [];
}
