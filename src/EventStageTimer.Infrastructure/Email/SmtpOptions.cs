namespace EventStageTimer.Infrastructure.Email;

public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public bool UseStartTls { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "noreply@example.com";
    public string FromName { get; set; } = "Event Stage Timer";
    public int TimeoutMs { get; set; } = 10_000;
}
