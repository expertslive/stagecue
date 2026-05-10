using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/members")]
public sealed class MembersController(AppDbContext db) : ControllerBase
{
    public sealed record MemberDto(Guid Id, Guid UserId, string Email, string? DisplayName, EventRole Role, IReadOnlyList<Guid> ScopedRoomIds);
    public sealed record UpdateRoleBody(EventRole Role, IReadOnlyList<Guid>? ScopedRoomIds);

    [HttpGet]
    public async Task<IReadOnlyList<MemberDto>> List(Guid eventId, CancellationToken ct)
    {
        var rows = await db.EventMemberships
            .Where(m => m.EventId == eventId)
            .Select(m => new
            {
                m.Id, m.UserId, m.Role,
                Email = m.User.Email!,
                DisplayName = m.User.DisplayName,
                ScopedRoomIds = m.ScopedRooms.Select(s => s.RoomId).ToList(),
            }).ToListAsync(ct);
        return rows.Select(r => new MemberDto(r.Id, r.UserId, r.Email, r.DisplayName, r.Role, r.ScopedRoomIds)).ToList();
    }

    [HttpPut("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> UpdateRole(Guid eventId, Guid membershipId, [FromBody] UpdateRoleBody body, CancellationToken ct)
    {
        var m = await db.EventMemberships
            .Include(x => x.ScopedRooms)
            .FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();
        m.Role = body.Role;
        m.ScopedRooms.Clear();
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { } ids)
        {
            foreach (var rid in ids)
                m.ScopedRooms.Add(new EventMembershipRoom { EventMembershipId = m.Id, RoomId = rid });
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Remove(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var m = await db.EventMemberships.FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();
        db.EventMemberships.Remove(m);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
