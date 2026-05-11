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

        // Prevent demoting the last EventAdmin — would leave the event unmanageable.
        if (m.Role == EventRole.EventAdmin && body.Role != EventRole.EventAdmin)
        {
            var otherAdmins = await db.EventMemberships
                .CountAsync(x => x.EventId == eventId && x.Role == EventRole.EventAdmin && x.Id != m.Id, ct);
            if (otherAdmins == 0)
                return Conflict(new { error = "LastAdmin", message = "Cannot demote the last EventAdmin." });
        }

        m.Role = body.Role;
        m.ScopedRooms.Clear();
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { Count: > 0 } ids)
        {
            // Reject IDs from other events — caller can only scope to rooms in this event.
            var validIds = await db.Rooms
                .Where(r => r.EventId == eventId && ids.Contains(r.Id))
                .Select(r => r.Id).ToListAsync(ct);
            if (validIds.Count != ids.Count)
                return BadRequest(new { error = "InvalidRoomIds", message = "ScopedRoomIds contains rooms not in this event." });
            foreach (var rid in validIds)
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

        if (m.Role == EventRole.EventAdmin)
        {
            var otherAdmins = await db.EventMemberships
                .CountAsync(x => x.EventId == eventId && x.Role == EventRole.EventAdmin && x.Id != m.Id, ct);
            if (otherAdmins == 0)
                return Conflict(new { error = "LastAdmin", message = "Cannot remove the last EventAdmin." });
        }

        db.EventMemberships.Remove(m);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
