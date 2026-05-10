namespace EventStageTimer.Api.Auth.Public;

public sealed class PublicAccessContext
{
    public Guid? TenantId { get; set; }
    public Guid? RoomId { get; set; }
    public Guid? EventId { get; set; }
    public string? AccessCode { get; set; }
    public bool IsLobbyCode { get; set; }
}
