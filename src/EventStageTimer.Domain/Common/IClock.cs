namespace EventStageTimer.Domain.Common;

public interface IClock
{
    DateTime UtcNow { get; }
    long UnixTimeMilliseconds => new DateTimeOffset(UtcNow, TimeSpan.Zero).ToUnixTimeMilliseconds();
}
