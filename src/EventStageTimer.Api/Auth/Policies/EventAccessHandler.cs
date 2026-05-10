using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class EventAccessHandler(AppDbContext db, IHttpContextAccessor http) : AuthorizationHandler<EventAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext ctx, EventAccessRequirement requirement)
    {
        var userIdClaim = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdClaim, out var userId)) return;

        var eventId = ResolveEventId(http.HttpContext);
        if (eventId is null) return;

        var membership = await db.EventMemberships
            .IgnoreQueryFilters()
            .Where(em => em.EventId == eventId && em.UserId == userId)
            .Select(em => (EventRole?)em.Role)
            .FirstOrDefaultAsync();

        if (membership is { } role && role <= requirement.MinimumRole)
            ctx.Succeed(requirement);
    }

    private static Guid? ResolveEventId(HttpContext? ctx)
    {
        if (ctx is null) return null;
        var route = ctx.GetRouteData();
        if (route.Values.TryGetValue("eventId", out var v) && Guid.TryParse(v?.ToString(), out var g)) return g;
        if (ctx.Request.Query.TryGetValue("eventId", out var qv) && Guid.TryParse(qv, out var qg)) return qg;
        return null;
    }
}
