using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth;

public static class SignInHelper
{
    public static async Task SignInWithTenantAsync(HttpContext ctx, AppDbContext db, User user, CancellationToken ct)
    {
        var primaryTenantId = await db.TenantMemberships
            .IgnoreQueryFilters()
            .Where(tm => tm.UserId == user.Id)
            .OrderBy(tm => tm.Role) // Owner=1 < Admin=2
            .Select(tm => (Guid?)tm.TenantId)
            .FirstOrDefaultAsync(ct);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
        };
        if (primaryTenantId is { } tid) claims.Add(new Claim("tid", tid.ToString()));

        var identity = new ClaimsIdentity(claims, IdentitySetup.SchemeName);
        await ctx.SignInAsync(IdentitySetup.SchemeName, new ClaimsPrincipal(identity));
    }
}
