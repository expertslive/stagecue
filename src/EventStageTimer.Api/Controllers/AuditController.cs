using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/audit")]
public sealed class AuditController(AppDbContext db) : ControllerBase
{
    public sealed record EntryDto(Guid Id, DateTime AtUtc, Guid? UserId, string? UserEmail, Guid? RoomId, string? RoomName, string Action, string DetailsJson);

    [HttpGet]
    public async Task<IReadOnlyList<EntryDto>> List(Guid eventId, [FromQuery] int take = 200, CancellationToken ct = default)
    {
        var rows = await db.AuditLog
            .Where(a => a.EventId == eventId || db.Rooms.Any(r => r.Id == a.RoomId && r.EventId == eventId))
            .OrderByDescending(a => a.AtUtc)
            .Take(Math.Clamp(take, 1, 1000))
            .Select(a => new
            {
                a.Id, a.AtUtc, a.UserId, a.RoomId, a.Action, a.DetailsJson,
                UserEmail = a.UserId == null ? null : db.Users.Where(u => u.Id == a.UserId).Select(u => u.Email).FirstOrDefault(),
                RoomName = a.RoomId == null ? null : db.Rooms.Where(r => r.Id == a.RoomId).Select(r => r.Name).FirstOrDefault(),
            }).ToListAsync(ct);
        return rows.Select(r => new EntryDto(r.Id, r.AtUtc, r.UserId, r.UserEmail, r.RoomId, r.RoomName, r.Action, r.DetailsJson)).ToList();
    }
}
