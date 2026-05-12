using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace EventStageTimer.Api.Auth.Public;

public sealed class PublicAccessCodeAuthHandler(
    IOptionsMonitor<PublicAccessCodeAuthOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db,
    PublicAccessContext context,
    ITenantContext tenantContext)
    : AuthenticationHandler<PublicAccessCodeAuthOptions>(options, logger, encoder)
{
    public const string SchemeName = "PublicAccessCode";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var path = Request.Path.Value ?? "";
        string? raw = null;
        bool isLobby = false;
        if (path.StartsWith("/r/", StringComparison.Ordinal)) { raw = ExtractSegment(path, 3); }
        else if (path.StartsWith("/e/", StringComparison.Ordinal)) { raw = ExtractSegment(path, 3); isLobby = true; }
        // Hub negotiate: code is in querystring "?code=" and the surface hint disambiguates
        // lobby (event-level) codes from room codes — without this, a lobby connection's
        // negotiate against /hub/timer would fall through to a room lookup and 401.
        if (raw is null && Request.Query.TryGetValue("code", out var q))
        {
            raw = q.ToString();
            if (Request.Query.TryGetValue("surface", out var surface) && surface.ToString() == "lobby")
                isLobby = true;
        }

        if (raw is null || !AccessCode.TryParse(raw, out var code))
            return AuthenticateResult.NoResult();

        if (isLobby)
        {
            var ev = await db.Events.IgnoreQueryFilters()
                .Where(e => e.LobbyAccessCode == code.Value)
                .Select(e => new { e.Id, e.TenantId })
                .FirstOrDefaultAsync();
            if (ev is null) return AuthenticateResult.Fail("Invalid code");
            context.AccessCode = code.Value;
            context.EventId = ev.Id;
            context.TenantId = ev.TenantId;
            context.IsLobbyCode = true;
        }
        else
        {
            // Try room first; if the code matches a lobby code instead, accept that.
            // The hub negotiate path may arrive without the surface hint when the client
            // hasn't explicitly tagged itself yet — fall through gracefully.
            var room = await db.Rooms.IgnoreQueryFilters()
                .Where(r => r.AccessCode == code.Value)
                .Select(r => new { r.Id, r.EventId, r.TenantId })
                .FirstOrDefaultAsync();
            if (room is not null)
            {
                context.AccessCode = code.Value;
                context.RoomId = room.Id;
                context.EventId = room.EventId;
                context.TenantId = room.TenantId;
            }
            else
            {
                var ev = await db.Events.IgnoreQueryFilters()
                    .Where(e => e.LobbyAccessCode == code.Value)
                    .Select(e => new { e.Id, e.TenantId })
                    .FirstOrDefaultAsync();
                if (ev is null) return AuthenticateResult.Fail("Invalid code");
                context.AccessCode = code.Value;
                context.EventId = ev.Id;
                context.TenantId = ev.TenantId;
                context.IsLobbyCode = true;
            }
        }

        if (context.TenantId is { } tid) tenantContext.Set(tid);

        var claims = new List<Claim>
        {
            new("acl", code.Value),
            new("scope", isLobby ? "lobby" : "room"),
        };
        if (context.RoomId is { } rid) claims.Add(new Claim("rid", rid.ToString()));
        if (context.EventId is { } eid) claims.Add(new Claim("eid", eid.ToString()));
        if (context.TenantId is { } tid2) claims.Add(new Claim("tid", tid2.ToString()));

        var identity = new ClaimsIdentity(claims, SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    private static string? ExtractSegment(string path, int startIndex)
    {
        var rest = path[startIndex..];
        var slash = rest.IndexOf('/');
        return slash < 0 ? rest : rest[..slash];
    }
}
