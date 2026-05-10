using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using System.Net.Http.Json;

namespace EventStageTimer.Api.Tests.Fixtures;

public static class AuthHelpers
{
    public sealed record BootstrapResponse(Guid TenantId, Guid UserId);
    public sealed record SignInBody(string Email, string Password);

    public static async Task<BootstrapResponse> BootstrapTenantAsync(HttpClient http, string ownerEmail, string ownerPassword)
    {
        var body = new
        {
            TenantName = "Test Tenant",
            TenantSlug = $"test-{Guid.NewGuid():N}",
            OwnerEmail = ownerEmail,
            OwnerPassword = ownerPassword,
            OwnerDisplayName = "Owner",
        };
        var resp = await http.PostAsJsonAsync("/api/setup/initialize", body);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<BootstrapResponse>())!;
    }

    public static async Task SignInAsync(HttpClient http, string email, string password)
    {
        var resp = await http.PostAsJsonAsync("/api/auth/password/signin", new SignInBody(email, password));
        resp.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Builds a SignalR HubConnection that reuses the auth cookie captured by TestApiFactory.
    /// The default Mvc.Testing handler does not maintain cookies, so this attaches the
    /// "est.session" cookie via a delegating handler.
    /// </summary>
    public static HubConnection BuildAuthenticatedHubConnection(TestApiFactory factory, HttpClient signedInClient, string hubPath = "/hub/timer")
    {
        var cookie = factory.LastSignInCookie ?? throw new InvalidOperationException("Sign in via SignInAsync first");
        return new HubConnectionBuilder()
            .WithUrl(new Uri(signedInClient.BaseAddress!, hubPath).ToString(), o =>
            {
                // TestServer doesn't support WebSocket transport; force long polling.
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => new CookieAttachingHandler(cookie) { InnerHandler = factory.Server.CreateHandler() };
            })
            .Build();
    }

    /// <summary>For public clients (no operator cookie) connecting via access code in the querystring.</summary>
    public static HubConnection BuildPublicHubConnection(TestApiFactory factory, HttpClient client, string accessCode, string hubPath = "/hub/timer")
    {
        var url = new Uri(client.BaseAddress!, $"{hubPath}?code={Uri.EscapeDataString(accessCode)}").ToString();
        return new HubConnectionBuilder()
            .WithUrl(url, o =>
            {
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            })
            .Build();
    }

    private sealed class CookieAttachingHandler(string cookie) : DelegatingHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            request.Headers.Add("Cookie", cookie);
            return base.SendAsync(request, ct);
        }
    }
}
