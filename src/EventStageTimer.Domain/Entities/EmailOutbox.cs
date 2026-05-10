namespace EventStageTimer.Domain.Entities;

public class EmailOutbox
{
    public Guid Id { get; set; }
    public required string ToAddress { get; set; }
    public required string Subject { get; set; }
    public required string BodyHtml { get; set; }
    public required string BodyText { get; set; }
    public DateTime EnqueuedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public string? LastError { get; set; }
    public int RetryCount { get; set; }
}
