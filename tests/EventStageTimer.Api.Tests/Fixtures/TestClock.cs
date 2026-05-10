using EventStageTimer.Domain.Common;

namespace EventStageTimer.Api.Tests.Fixtures;

public sealed class TestClock(DateTime initial) : IClock
{
    private DateTime _now = DateTime.SpecifyKind(initial, DateTimeKind.Utc);
    public DateTime UtcNow => _now;
    public void Advance(TimeSpan delta) => _now = _now.Add(delta);
    public void Set(DateTime utc) => _now = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
}
