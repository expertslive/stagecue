using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class RoomAccessHandler(AppDbContext db, IHttpContextAccessor http) : AuthorizationHandler<RoomAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext ctx, RoomAccessRequirement requirement)
    {
        var userIdClaim = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdClaim, out var userId)) return;

        var roomId = ResolveRoomId(http.HttpContext);
        if (roomId is null) return;

        var room = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.Id == roomId)
            .Select(r => new { r.Id, r.EventId, r.TenantId })
            .FirstOrDefaultAsync();
        if (room is null) return;

        var membership = await db.EventMemberships
            .IgnoreQueryFilters()
            .Where(em => em.EventId == room.EventId && em.UserId == userId)
            .Select(em => new { em.Id, em.Role })
            .FirstOrDefaultAsync();
        if (membership is null) return;

        if (membership.Role > requirement.MinimumRole) return; // not high enough

        if (membership.Role == EventRole.RoomOperator)
        {
            var inScope = await db.EventMembershipRooms
                .IgnoreQueryFilters()
                .AnyAsync(emr => emr.EventMembershipId == membership.Id && emr.RoomId == room.Id);
            if (!inScope) return;
        }

        ctx.Succeed(requirement);
    }

    private static Guid? ResolveRoomId(HttpContext? ctx)
    {
        if (ctx is null) return null;
        var route = ctx.GetRouteData();
        if (route.Values.TryGetValue("roomId", out var v) && Guid.TryParse(v?.ToString(), out var g)) return g;
        if (ctx.Request.Query.TryGetValue("roomId", out var qv) && Guid.TryParse(qv, out var qg)) return qg;
        return null;
    }
}
