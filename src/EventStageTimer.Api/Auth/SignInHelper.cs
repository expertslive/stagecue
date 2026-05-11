using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth;

public static class SignInHelper
{
    public static async Task SignInWithTenantAsync(HttpContext ctx, AppDbContext db, User user, CancellationToken ct)
    {
        var primaryTenantId = await ResolveTenantAsync(db, user.Id, ct);
        var users = ctx.RequestServices.GetRequiredService<UserManager<User>>();
        var stamp = await users.GetSecurityStampAsync(user);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
            // Carried in the cookie so SecurityStampPrincipalValidator can compare with the
            // user's current stamp and reject sessions issued before a password reset.
            new(IdentitySetup.SecurityStampClaim, stamp),
        };
        if (primaryTenantId is { } tid) claims.Add(new Claim("tid", tid.ToString()));

        var identity = new ClaimsIdentity(claims, IdentitySetup.SchemeName);
        await ctx.SignInAsync(IdentitySetup.SchemeName, new ClaimsPrincipal(identity));
    }

    /// <summary>
    /// Primary tenant for a user (lowest TenantRole numerically — Owner before Admin).
    /// Used both at sign-in time and when writing auth audit entries.
    /// </summary>
    public static Task<Guid?> ResolveTenantAsync(AppDbContext db, Guid userId, CancellationToken ct) =>
        db.TenantMemberships.IgnoreQueryFilters()
            .Where(tm => tm.UserId == userId)
            .OrderBy(tm => tm.Role)
            .Select(tm => (Guid?)tm.TenantId)
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// Writes an auth-related audit entry under the user's primary tenant. No-ops when no
    /// tenant is resolvable (e.g. failed sign-in for an unknown email) — those still go to
    /// Serilog via the calling controller.
    /// </summary>
    public static async Task AuditAuthAsync(
        AppDbContext db, IClock clock, HttpContext ctx, Guid userId, string action, string detailsJson, CancellationToken ct)
    {
        var tenantId = await ResolveTenantAsync(db, userId, ct);
        if (tenantId is null) return;

        var ip = ctx.Connection.RemoteIpAddress?.ToString();
        var ua = ctx.Request.Headers.UserAgent.ToString();
        var enrichedDetails = $"{{\"ip\":\"{ip}\",\"ua\":\"{Sanitize(ua)}\",\"context\":{detailsJson}}}";
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId.Value,
            UserId = userId,
            Action = action,
            DetailsJson = enrichedDetails,
            AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }

    private static string Sanitize(string s) =>
        s.Length > 200 ? s[..200].Replace("\"", "'") : s.Replace("\"", "'");
}
