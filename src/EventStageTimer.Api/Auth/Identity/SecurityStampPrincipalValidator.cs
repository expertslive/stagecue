using EventStageTimer.Domain.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Identity;

/// <summary>
/// Re-validates the cookie principal against the user's current SecurityStamp at most every
/// 5 minutes. On mismatch (e.g. after a password reset), the cookie is rejected and the
/// browser is signed out.
/// </summary>
public static class SecurityStampPrincipalValidator
{
    private static readonly TimeSpan ValidationInterval = TimeSpan.FromMinutes(5);
    private const string LastValidatedClaim = "AspNet.Identity.SecurityStampValidatedAt";

    public static async Task ValidateAsync(CookieValidatePrincipalContext ctx)
    {
        var principal = ctx.Principal;
        if (principal is null) { ctx.RejectPrincipal(); return; }

        // Throttle DB hits: only re-check when the interval has elapsed since the last
        // successful validation, recorded as a claim we add to the principal.
        var now = DateTimeOffset.UtcNow;
        var lastClaim = principal.FindFirstValue(LastValidatedClaim);
        if (DateTimeOffset.TryParse(lastClaim, out var last) && (now - last) < ValidationInterval)
            return;

        var stampClaim = principal.FindFirstValue(IdentitySetup.SecurityStampClaim);
        var uidStr = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(stampClaim) || !Guid.TryParse(uidStr, out _))
        {
            await SignOutAsync(ctx);
            return;
        }

        var users = ctx.HttpContext.RequestServices.GetRequiredService<UserManager<User>>();
        var user = await users.FindByIdAsync(uidStr!);
        if (user is null) { await SignOutAsync(ctx); return; }

        var current = await users.GetSecurityStampAsync(user);
        if (!string.Equals(current, stampClaim, StringComparison.Ordinal))
        {
            await SignOutAsync(ctx);
            return;
        }

        // Refresh the validated-at marker on the principal and re-issue the cookie.
        var identity = (ClaimsIdentity)principal.Identity!;
        var existing = identity.FindFirst(LastValidatedClaim);
        if (existing is not null) identity.RemoveClaim(existing);
        identity.AddClaim(new Claim(LastValidatedClaim, now.ToString("O")));
        ctx.ShouldRenew = true;
    }

    private static async Task SignOutAsync(CookieValidatePrincipalContext ctx)
    {
        ctx.RejectPrincipal();
        await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }
}
