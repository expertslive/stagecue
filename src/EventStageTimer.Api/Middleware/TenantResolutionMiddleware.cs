using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Middleware;

public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx, ITenantContext tenantContext, AppDbContext db)
    {
        // 1. Authenticated requests carry a "tid" claim.
        var tid = ctx.User.FindFirstValue("tid");
        if (Guid.TryParse(tid, out var fromClaim))
        {
            tenantContext.Set(fromClaim);
            await next(ctx);
            return;
        }

        // 2. Public surfaces resolve tenant from the access code in the path.
        if (TryExtractAccessCode(ctx.Request.Path, out var raw) && AccessCode.TryParse(raw, out var code))
        {
            // Look up across tenants without filter (system-level read).
            var tenantId = await db.Rooms
                .IgnoreQueryFilters()
                .Where(r => r.AccessCode == code.Value)
                .Select(r => (Guid?)r.TenantId)
                .FirstOrDefaultAsync();
            tenantId ??= await db.Events
                .IgnoreQueryFilters()
                .Where(e => e.LobbyAccessCode == code.Value)
                .Select(e => (Guid?)e.TenantId)
                .FirstOrDefaultAsync();

            if (tenantId is { } resolved)
                tenantContext.Set(resolved);
        }

        await next(ctx);
    }

    private static bool TryExtractAccessCode(PathString path, out string raw)
    {
        raw = "";
        var s = path.Value ?? "";
        // /r/{code}/...  or  /e/{code}/...
        if ((s.StartsWith("/r/", StringComparison.Ordinal) || s.StartsWith("/e/", StringComparison.Ordinal)) && s.Length > 3)
        {
            var rest = s[3..];
            var slash = rest.IndexOf('/');
            raw = slash < 0 ? rest : rest[..slash];
            return true;
        }
        return false;
    }
}
