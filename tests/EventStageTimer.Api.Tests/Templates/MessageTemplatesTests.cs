using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Templates;

[Collection("sqlserver")]
public sealed class MessageTemplatesTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task EventAdmin_can_create_list_update_delete_templates()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        var created = await _http.PostAsJsonAsync($"/api/events/{seeded.EventId}/templates", new { Text = "Wrap up", SortOrder = 0 });
        created.EnsureSuccessStatusCode();
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        var templateId = doc.GetProperty("id").GetGuid();

        var list = await _http.GetFromJsonAsync<JsonElement>($"/api/events/{seeded.EventId}/templates");
        list.GetArrayLength().Should().Be(1);
        list[0].GetProperty("text").GetString().Should().Be("Wrap up");

        var updated = await _http.PutAsJsonAsync($"/api/events/{seeded.EventId}/templates/{templateId}", new { Text = "5 min over", SortOrder = 1 });
        updated.EnsureSuccessStatusCode();

        var deleted = await _http.DeleteAsync($"/api/events/{seeded.EventId}/templates/{templateId}");
        deleted.EnsureSuccessStatusCode();

        var listAfter = await _http.GetFromJsonAsync<JsonElement>($"/api/events/{seeded.EventId}/templates");
        listAfter.GetArrayLength().Should().Be(0);
    }
}
