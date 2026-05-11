using System.Text.Json;
using System.Text.Json.Serialization;

namespace EventStageTimer.Api.Tests.Fixtures;

/// <summary>
/// Shared JsonSerializerOptions for tests — mirrors the API's controller / SignalR config
/// so enum payloads round-trip as the same strings the production clients see.
/// </summary>
public static class TestJsonOptions
{
    public static readonly JsonSerializerOptions Default = Create();

    public static JsonSerializerOptions Create()
    {
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        opts.Converters.Add(new JsonStringEnumConverter());
        opts.Converters.Add(new EventStageTimer.Api.Serialization.UtcDateTimeConverter());
        opts.Converters.Add(new EventStageTimer.Api.Serialization.NullableUtcDateTimeConverter());
        return opts;
    }
}
