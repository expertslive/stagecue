using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace EventStageTimer.Infrastructure.Email;

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly SmtpOptions _o = options.Value;

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_o.FromName, _o.FromAddress));
        msg.To.Add(MailboxAddress.Parse(message.To));
        msg.Subject = message.Subject;
        msg.Body = new BodyBuilder { HtmlBody = message.BodyHtml, TextBody = message.BodyText }.ToMessageBody();

        using var smtp = new SmtpClient { Timeout = _o.TimeoutMs };
        try
        {
            var socketOpt = _o.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
            await smtp.ConnectAsync(_o.Host, _o.Port, socketOpt, ct);
            if (!string.IsNullOrEmpty(_o.Username))
                await smtp.AuthenticateAsync(_o.Username, _o.Password, ct);
            await smtp.SendAsync(msg, ct);
            await smtp.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "SMTP send to {To} failed", message.To);
            throw new EmailSendException("Failed to send email", ex);
        }
    }
}
