using Microsoft.Extensions.Logging;

namespace EventStageTimer.Infrastructure.Email;

public sealed class NoOpEmailSender(ILogger<NoOpEmailSender> log) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        log.LogInformation("[NoOpEmail] To={To} Subject={Subject}", message.To, message.Subject);
        return Task.CompletedTask;
    }
}
