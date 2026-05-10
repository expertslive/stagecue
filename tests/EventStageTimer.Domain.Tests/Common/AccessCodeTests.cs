using EventStageTimer.Domain.Common;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Common;

public class AccessCodeTests
{
    [Theory]
    [InlineData("ABCD2345", "ABCD2345")]
    [InlineData("abcd2345", "ABCD2345")]
    [InlineData("ABCD-2345", "ABCD2345")]
    [InlineData("abcd-2345", "ABCD2345")]
    public void TryParse_accepts_both_dashed_and_undashed_normalised_to_uppercase(string input, string expectedNormalised)
    {
        AccessCode.TryParse(input, out var code).Should().BeTrue();
        code.Value.Should().Be(expectedNormalised);
    }

    [Theory]
    [InlineData("ABCD234")]      // 7 chars
    [InlineData("ABCD23456")]    // 9 chars
    [InlineData("ABCD2I45")]     // 'I' excluded
    [InlineData("ABCD2O45")]     // 'O' excluded
    [InlineData("ABCD2045")]     // '0' excluded
    [InlineData("ABCD2145")]     // '1' excluded
    [InlineData("ABCD-23-45")]   // wrong dash placement
    public void TryParse_rejects_invalid_codes(string input)
    {
        AccessCode.TryParse(input, out _).Should().BeFalse();
    }

    [Fact]
    public void Format_inserts_dash_in_the_middle()
    {
        var code = AccessCode.From("ABCD2345");
        code.Formatted.Should().Be("ABCD-2345");
    }
}
