namespace EventStageTimer.Domain.Entities;

public class Event
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public required string Name { get; set; }
    public required string TimeZone { get; set; } // IANA, e.g. "Europe/Amsterdam"
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public string LobbyAccessCode { get; set; } = null!; // 8 chars, no dash
    public string? LogoBlobKey { get; set; }
    public string ThemeJson { get; set; } = "{}";
    public string DefaultThresholdsJson { get; set; } = "[]";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<Room> Rooms { get; set; } = [];
    public ICollection<EventMembership> Memberships { get; set; } = [];
}
