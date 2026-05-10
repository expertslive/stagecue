using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using Polly;
using Polly.Retry;

namespace EventStageTimer.Infrastructure.Email;

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly SmtpOptions _o = options.Value;

    /// <summary>
    /// Retry up to 3 times with exponential backoff (250ms, 500ms, 1s) on transient SMTP failures.
    /// Auth and recipient-rejection errors are not retried — they're not transient.
    /// </summary>
    private static readonly ResiliencePipeline RetryPipeline = new ResiliencePipelineBuilder()
        .AddRetry(new RetryStrategyOptions
        {
            ShouldHandle = new PredicateBuilder()
                .Handle<MailKit.Net.Smtp.SmtpProtocolException>()
                .Handle<System.IO.IOException>()
                .Handle<TimeoutException>(),
            MaxRetryAttempts = 3,
            BackoffType = DelayBackoffType.Exponential,
            Delay = TimeSpan.FromMilliseconds(250),
        })
        .Build();

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_o.FromName, _o.FromAddress));
        msg.To.Add(MailboxAddress.Parse(message.To));
        msg.Subject = message.Subject;
        msg.Body = new BodyBuilder { HtmlBody = message.BodyHtml, TextBody = message.BodyText }.ToMessageBody();

        try
        {
            await RetryPipeline.ExecuteAsync(async (token) =>
            {
                using var smtp = new SmtpClient { Timeout = _o.TimeoutMs };
                var socketOpt = _o.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
                await smtp.ConnectAsync(_o.Host, _o.Port, socketOpt, token);
                if (!string.IsNullOrEmpty(_o.Username))
                    await smtp.AuthenticateAsync(_o.Username, _o.Password, token);
                await smtp.SendAsync(msg, token);
                await smtp.DisconnectAsync(true, token);
            }, ct);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "SMTP send to {To} failed after retries", message.To);
            throw new EmailSendException("Failed to send email", ex);
        }
    }
}
