using EventStageTimer.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Persistence.ModelConfiguration;

internal static class TenancyQueryFilters
{
    public static void Apply(ModelBuilder b, Func<Guid?> currentTenantId)
    {
        // Apply to every entity carrying a TenantId column.
        b.Entity<TenantMembership>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Event>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<EventMembership>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Invitation>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Room>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<ScheduleItem>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<ScheduleItemRun>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<RoomTimerState>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<MessageTemplate>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<AuditLogEntry>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
    }
}
