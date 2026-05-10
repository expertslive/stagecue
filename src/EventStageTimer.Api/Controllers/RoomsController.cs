using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Auth;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events/{eventId:guid}/rooms")]
public sealed class RoomsController(AppDbContext db, IClock clock, IAccessCodeGenerator codes) : ControllerBase
{
    public sealed record RoomDto(Guid Id, Guid EventId, string Name, string AccessCode, int DefaultPreRollSec);
    public sealed record CreateBody(string Name, int DefaultPreRollSec = 30);
    public sealed record UpdateBody(string Name, int DefaultPreRollSec);

    [HttpGet]
    [Authorize(Policy = "EventViewer")]
    public async Task<IReadOnlyList<RoomDto>> List(Guid eventId, CancellationToken ct) =>
        await db.Rooms
            .Where(r => r.EventId == eventId)
            .Select(r => new RoomDto(r.Id, r.EventId, r.Name, r.AccessCode, r.DefaultPreRollSec))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<RoomDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var code = await codes.GenerateUniqueAsync(ct);
        var room = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = ev.TenantId,
            EventId = eventId,
            Name = body.Name,
            AccessCode = code.Value,
            DefaultPreRollSec = body.DefaultPreRollSec,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Rooms.Add(room);
        // Initialize timer state
        db.RoomTimerStates.Add(new RoomTimerState
        {
            RoomId = room.Id,
            TenantId = ev.TenantId,
            Phase = TimerPhase.Idle,
        });
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new { eventId }, new RoomDto(room.Id, room.EventId, room.Name, room.AccessCode, room.DefaultPreRollSec));
    }

    [HttpPut("{roomId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, Guid roomId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        room.Name = body.Name;
        room.DefaultPreRollSec = body.DefaultPreRollSec;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{roomId:guid}/regenerate-access-code")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<RoomDto>> RegenerateAccessCode(Guid eventId, Guid roomId, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        var newCode = await codes.GenerateUniqueAsync(ct);
        room.AccessCode = newCode.Value;
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(), TenantId = room.TenantId,
            EventId = eventId, RoomId = roomId,
            Action = "RegenerateAccessCode", DetailsJson = "{}", AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return Ok(new RoomDto(room.Id, room.EventId, room.Name, room.AccessCode, room.DefaultPreRollSec));
    }

    [HttpDelete("{roomId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, Guid roomId, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        room.DeletedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
