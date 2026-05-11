using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EventStageTimer.Api.Tests.Fixtures;

public sealed class TestApiFactory(SqlServerFixture sql, string environmentName = "Testing", string? setupInitSecret = null) : WebApplicationFactory<Program>
{
    public TestClock Clock { get; } = new(new DateTime(2026, 5, 10, 14, 0, 0, DateTimeKind.Utc));

    /// <summary>The "est.session" cookie captured from the most recent sign-in response.</summary>
    public string? LastSignInCookie { get; set; }

    /// <summary>Per-instance database name so parallel test classes don't collide.</summary>
    private readonly string _dbName = $"EventStageTimer_Test_{Guid.NewGuid():N}";

    private string ConnectionString
    {
        get
        {
            var sb = new SqlConnectionStringBuilder(sql.ConnectionString) { InitialCatalog = _dbName };
            return sb.ConnectionString;
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environmentName);

        builder.ConfigureAppConfiguration((_, cfg) =>
        {
            var dict = new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = ConnectionString,
                ["Database:AutoMigrate"] = "true",
                ["Auth:Mode"] = "Password",
                ["App:BaseUrl"] = "http://localhost",
            };
            if (setupInitSecret is not null) dict["Setup:InitSecret"] = setupInitSecret;
            cfg.AddInMemoryCollection(dict);
        });

        builder.ConfigureServices(services =>
        {
            // Replace IClock with the deterministic test clock
            var clockDescriptor = services.Single(s => s.ServiceType == typeof(IClock));
            services.Remove(clockDescriptor);
            services.AddSingleton<IClock>(Clock);
        });

        builder.ConfigureTestServices(services =>
        {
            // After the host is built, ensure migrations are applied. We rely on the auto-migrate
            // path in Program.cs which the WebApplicationFactory triggers.
        });
    }

    /// <summary>
    /// Creates an HttpClient that records the est.session Set-Cookie value into <see cref="LastSignInCookie"/>
    /// and re-attaches it on every outbound request. Use this instead of <c>CreateClient()</c> when running
    /// tests that exercise auth — the WebApplicationFactory default handler does NOT maintain a CookieContainer.
    /// </summary>
    public HttpClient CreateRecordingClient()
    {
        var recorder = new SetCookieRecorder(this) { InnerHandler = Server.CreateHandler() };
        var client = new HttpClient(recorder) { BaseAddress = Server.BaseAddress };
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            try
            {
                using var conn = new SqlConnection(sql.ConnectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = $"IF DB_ID('{_dbName}') IS NOT NULL BEGIN ALTER DATABASE [{_dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_dbName}]; END";
                cmd.ExecuteNonQuery();
            }
            catch { /* best-effort cleanup */ }
        }
        base.Dispose(disposing);
    }

    private sealed class SetCookieRecorder(TestApiFactory factory) : DelegatingHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            // Re-attach a captured session cookie on every outbound request — the WebApplicationFactory's
            // default handler does not maintain a CookieContainer.
            if (factory.LastSignInCookie is not null && !request.Headers.Contains("Cookie"))
                request.Headers.Add("Cookie", factory.LastSignInCookie);

            var response = await base.SendAsync(request, ct);
            if (response.Headers.TryGetValues("Set-Cookie", out var values))
            {
                var session = values.FirstOrDefault(v => v.StartsWith("est.session=", StringComparison.OrdinalIgnoreCase));
                if (session is not null)
                {
                    var first = session.IndexOf(';');
                    factory.LastSignInCookie = first < 0 ? session : session[..first];
                }
            }
            return response;
        }
    }
}
