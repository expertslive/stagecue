namespace EventStageTimer.Infrastructure.Email;

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public sealed record EmailMessage(string To, string Subject, string BodyHtml, string BodyText);

public sealed class EmailSendException(string message, Exception? inner = null) : Exception(message, inner);
