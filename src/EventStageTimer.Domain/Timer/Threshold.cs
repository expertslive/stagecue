using System.Text.Json;

namespace EventStageTimer.Domain.Timer;

public sealed record Threshold(int SecondsRemaining, string ColorToken, string? Label = null);

public static class ThresholdParser
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<Threshold> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "[]") return [];
        return JsonSerializer.Deserialize<List<Threshold>>(json, Options) ?? [];
    }

    public static string Serialize(IEnumerable<Threshold> thresholds) =>
        JsonSerializer.Serialize(thresholds, Options);
}

public static class ThresholdSelector
{
    /// <summary>
    /// Picks the smallest <see cref="Threshold.SecondsRemaining"/> still ≥ <paramref name="remainingMs"/>/1000
    /// — the tightest threshold we've crossed but not yet crossed past. Returns null if no threshold matches.
    /// </summary>
    public static Threshold? Active(IReadOnlyList<Threshold> thresholds, double remainingMs)
    {
        if (remainingMs <= 0 || thresholds.Count == 0) return null;
        Threshold? best = null;
        foreach (var t in thresholds)
        {
            if (t.SecondsRemaining * 1000.0 < remainingMs) continue; // not crossed
            if (best is null || t.SecondsRemaining < best.SecondsRemaining)
                best = t;
        }
        return best;
    }
}
