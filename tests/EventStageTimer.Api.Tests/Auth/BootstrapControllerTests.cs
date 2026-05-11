using EventStageTimer.Api.Tests.Fixtures;
using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Auth;

[Collection("sqlserver")]
public sealed class BootstrapControllerTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Status_reflects_empty_then_initialized()
    {
        var s1 = await _http.GetAsync("/api/setup/status");
        s1.EnsureSuccessStatusCode();
        var b1 = await s1.Content.ReadFromJsonAsync<JsonElement>();
        b1.GetProperty("initialized").GetBoolean().Should().BeFalse();

        await BootstrapAsync("owner@t.local", "Strong_Pwd_123");

        var s2 = await _http.GetAsync("/api/setup/status");
        s2.EnsureSuccessStatusCode();
        var b2 = await s2.Content.ReadFromJsonAsync<JsonElement>();
        b2.GetProperty("initialized").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Initialize_creates_tenant_and_owner_user()
    {
        var resp = await BootstrapAsync("owner@t.local", "Strong_Pwd_123");
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("tenantId").GetGuid().Should().NotBe(Guid.Empty);
        body.GetProperty("userId").GetGuid().Should().NotBe(Guid.Empty);
    }

    [Fact]
    public async Task Initialize_second_call_returns_409_AlreadyInitialized()
    {
        (await BootstrapAsync("owner@t.local", "Strong_Pwd_123")).EnsureSuccessStatusCode();

        var second = await BootstrapAsync("hacker@t.local", "Strong_Pwd_123");
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("AlreadyInitialized");
    }

    [Fact]
    public async Task In_Testing_env_initialize_works_without_secret()
    {
        // The Testing environment bypasses Setup:InitSecret so integration tests stay frictionless.
        // Production behavior is exercised separately below.
        var resp = await BootstrapAsync("anon@t.local", "Strong_Pwd_123");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task In_Production_env_initialize_requires_X_Setup_Secret_header()
    {
        using var prodFactory = new TestApiFactory(sql, environmentName: "Production", setupInitSecret: "correct-secret-123");
        using var prodHttp = prodFactory.CreateRecordingClient();

        // No header → 401.
        var noHeader = await prodHttp.PostAsJsonAsync("/api/setup/initialize", BootstrapBody("a@t.local", "Strong_Pwd_123"));
        noHeader.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // Wrong header → 401.
        prodHttp.DefaultRequestHeaders.Remove("X-Setup-Secret");
        prodHttp.DefaultRequestHeaders.Add("X-Setup-Secret", "wrong");
        var wrongHeader = await prodHttp.PostAsJsonAsync("/api/setup/initialize", BootstrapBody("a@t.local", "Strong_Pwd_123"));
        wrongHeader.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        // Correct header → 200.
        prodHttp.DefaultRequestHeaders.Remove("X-Setup-Secret");
        prodHttp.DefaultRequestHeaders.Add("X-Setup-Secret", "correct-secret-123");
        var ok = await prodHttp.PostAsJsonAsync("/api/setup/initialize", BootstrapBody("a@t.local", "Strong_Pwd_123"));
        ok.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task In_Production_env_without_configured_secret_initialize_returns_503()
    {
        using var prodFactory = new TestApiFactory(sql, environmentName: "Production"); // no setupInitSecret
        using var prodHttp = prodFactory.CreateRecordingClient();

        var resp = await prodHttp.PostAsJsonAsync("/api/setup/initialize", BootstrapBody("a@t.local", "Strong_Pwd_123"));
        resp.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    private Task<HttpResponseMessage> BootstrapAsync(string email, string password) =>
        _http.PostAsJsonAsync("/api/setup/initialize", BootstrapBody(email, password));

    private static object BootstrapBody(string email, string password) => new
    {
        TenantName = "Bootstrap Test",
        TenantSlug = $"bt-{Guid.NewGuid():N}".Substring(0, 12),
        OwnerEmail = email,
        OwnerPassword = password,
        OwnerDisplayName = "Owner",
    };
}
