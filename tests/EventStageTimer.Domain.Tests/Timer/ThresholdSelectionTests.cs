using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Timer;

public class ThresholdSelectionTests
{
    private static readonly IReadOnlyList<Threshold> Thresholds =
    [
        new(600, "warning"),
        new(120, "danger"),
        new(30,  "final"),
    ];

    [Theory]
    [InlineData(700_000, null)]    // no threshold matches
    [InlineData(500_000, "warning")] // only 600 matches; pick 600
    [InlineData(100_000, "danger")]  // 600 + 120 match; pick 120 (smallest)
    [InlineData( 20_000, "final")]   // 600 + 120 + 30 match; pick 30
    [InlineData(    0,    null)]     // overrun branch — caller picks --overrun
    [InlineData(  -100,   null)]
    public void Active_picks_smallest_matching_threshold(double remainingMs, string? expectedToken)
    {
        var t = ThresholdSelector.Active(Thresholds, remainingMs);
        t?.ColorToken.Should().Be(expectedToken);
        if (expectedToken is null) t.Should().BeNull();
    }

    [Fact]
    public void Empty_thresholds_returns_null()
    {
        ThresholdSelector.Active([], 50_000).Should().BeNull();
    }
}
