using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;

namespace EventStageTimer.Api.Audit;

public interface IAuditWriter
{
    Task WriteAsync(string action, Guid? userId, Guid tenantId, Guid? eventId, Guid? roomId, string detailsJson, CancellationToken ct);
}

public sealed class AuditWriter(AppDbContext db, IClock clock) : IAuditWriter
{
    public async Task WriteAsync(string action, Guid? userId, Guid tenantId, Guid? eventId, Guid? roomId, string detailsJson, CancellationToken ct)
    {
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            EventId = eventId,
            RoomId = roomId,
            UserId = userId,
            Action = action,
            DetailsJson = detailsJson,
            AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }
}
