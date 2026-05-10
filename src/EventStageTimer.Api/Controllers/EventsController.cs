using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Auth;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events")]
public sealed class EventsController(AppDbContext db, IClock clock, IAccessCodeGenerator codes) : ControllerBase
{
    public sealed record EventDto(Guid Id, string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc, string LobbyAccessCode);
    public sealed record CreateBody(string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc);
    public sealed record UpdateBody(string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc);

    [HttpGet]
    public async Task<IReadOnlyList<EventDto>> List(CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return await db.Events
            .Where(e => e.Memberships.Any(m => m.UserId == userId))
            .Select(e => new EventDto(e.Id, e.Name, e.TimeZone, e.StartsAtUtc, e.EndsAtUtc, e.LobbyAccessCode))
            .ToListAsync(ct);
    }

    [HttpGet("{eventId:guid}")]
    [Authorize(Policy = "EventViewer")]
    public async Task<ActionResult<EventDto>> Get(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events
            .Where(e => e.Id == eventId)
            .Select(e => new EventDto(e.Id, e.Name, e.TimeZone, e.StartsAtUtc, e.EndsAtUtc, e.LobbyAccessCode))
            .FirstOrDefaultAsync(ct);
        return ev is null ? NotFound() : Ok(ev);
    }

    [HttpPost]
    public async Task<ActionResult<EventDto>> Create([FromBody] CreateBody body, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var tenantId = Guid.Parse(User.FindFirstValue("tid")!);
        var lobbyCode = await codes.GenerateUniqueAsync(ct);

        var ev = new Event
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = body.Name,
            TimeZone = body.TimeZone,
            StartsAtUtc = body.StartsAtUtc,
            EndsAtUtc = body.EndsAtUtc,
            LobbyAccessCode = lobbyCode.Value,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Events.Add(ev);

        // The creator becomes EventAdmin
        db.EventMemberships.Add(new EventMembership
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            EventId = ev.Id,
            UserId = userId,
            Role = EventRole.EventAdmin,
            CreatedAtUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { eventId = ev.Id }, new EventDto(ev.Id, ev.Name, ev.TimeZone, ev.StartsAtUtc, ev.EndsAtUtc, ev.LobbyAccessCode));
    }

    [HttpPut("{eventId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.Name = body.Name;
        ev.TimeZone = body.TimeZone;
        ev.StartsAtUtc = body.StartsAtUtc;
        ev.EndsAtUtc = body.EndsAtUtc;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{eventId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.DeletedAtUtc = clock.UtcNow; // soft delete
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
