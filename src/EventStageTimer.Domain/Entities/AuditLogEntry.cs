namespace EventStageTimer.Domain.Entities;

public class AuditLogEntry
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? EventId { get; set; }
    public Guid? RoomId { get; set; }
    public Guid? UserId { get; set; }
    public required string Action { get; set; } // e.g. "Start", "AdjustTime", "AutoStart"
    public string DetailsJson { get; set; } = "{}";
    public DateTime AtUtc { get; set; }
}
