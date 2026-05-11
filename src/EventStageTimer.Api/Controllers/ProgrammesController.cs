using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events/{eventId:guid}/programmes")]
public sealed class ProgrammesController(AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record ProgrammeDto(Guid Id, Guid EventId, string Name, IReadOnlyList<ProgrammeSlotDto> Slots);
    public sealed record ProgrammeSlotDto(Guid Id, Guid ProgrammeId, int Position, string Label, DateTime StartUtc, int DurationSec, int LinkedItemCount);
    public sealed record CreateProgrammeBody(string Name);
    public sealed record UpdateProgrammeBody(string Name);
    public sealed record CreateSlotBody(string Label, DateTime StartUtc, int DurationSec);
    /// <summary>
    /// Slot edit body. <see cref="Cascade"/> only matters if Start/Duration actually changed
    /// AND there are linked sessions: "update" → server pushes new time/duration to each linked
    /// session; "detach" → server nulls out each linked session's ProgrammeSlotId, leaving its
    /// previously-denormalised time/duration intact. Server defaults to "update" when omitted.
    /// </summary>
    public sealed record UpdateSlotBody(string Label, DateTime StartUtc, int DurationSec, string? Cascade);
    public sealed record ReorderBody(IReadOnlyList<Guid> SlotIdsInOrder);

    [HttpGet]
    [Authorize(Policy = "EventViewer")]
    public async Task<IReadOnlyList<ProgrammeDto>> List(Guid eventId, CancellationToken ct)
    {
        var programmes = await db.Programmes
            .Where(p => p.EventId == eventId)
            .Include(p => p.Slots.OrderBy(s => s.Position))
            .OrderBy(p => p.Name)
            .ToListAsync(ct);

        // Count linked sessions per slot in one round-trip.
        var slotIds = programmes.SelectMany(p => p.Slots.Select(s => s.Id)).ToList();
        var counts = slotIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await db.ScheduleItems
                .Where(i => i.ProgrammeSlotId != null && slotIds.Contains(i.ProgrammeSlotId!.Value))
                .GroupBy(i => i.ProgrammeSlotId!.Value)
                .Select(g => new { SlotId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.SlotId, x => x.Count, ct);

        return programmes
            .Select(p => new ProgrammeDto(p.Id, p.EventId, p.Name,
                p.Slots.OrderBy(s => s.Position)
                    .Select(s => new ProgrammeSlotDto(s.Id, s.ProgrammeId, s.Position, s.Label, s.StartUtc, s.DurationSec,
                        counts.GetValueOrDefault(s.Id)))
                    .ToList()))
            .ToList();
    }

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<ProgrammeDto>> Create(Guid eventId, [FromBody] CreateProgrammeBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Name)) return BadRequest(new { error = "EmptyName" });
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var p = new Programme
        {
            Id = Guid.NewGuid(),
            TenantId = ev.TenantId,
            EventId = eventId,
            Name = body.Name.Trim(),
            CreatedAtUtc = clock.UtcNow,
        };
        db.Programmes.Add(p);
        await db.SaveChangesAsync(ct);
        return Ok(new ProgrammeDto(p.Id, p.EventId, p.Name, Array.Empty<ProgrammeSlotDto>()));
    }

    [HttpPut("{programmeId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Rename(Guid eventId, Guid programmeId, [FromBody] UpdateProgrammeBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Name)) return BadRequest(new { error = "EmptyName" });
        var p = await db.Programmes.FirstOrDefaultAsync(x => x.Id == programmeId && x.EventId == eventId, ct);
        if (p is null) return NotFound();
        p.Name = body.Name.Trim();
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{programmeId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, Guid programmeId, CancellationToken ct)
    {
        var p = await db.Programmes
            .Include(x => x.Slots)
            .FirstOrDefaultAsync(x => x.Id == programmeId && x.EventId == eventId, ct);
        if (p is null) return NotFound();

        // Detach every session bound to one of this programme's slots so the cascade-delete
        // on slots doesn't trip the Restrict FK on ScheduleItem.ProgrammeSlotId.
        var slotIds = p.Slots.Select(s => s.Id).ToList();
        if (slotIds.Count > 0)
        {
            await db.ScheduleItems
                .Where(i => i.ProgrammeSlotId != null && slotIds.Contains(i.ProgrammeSlotId!.Value))
                .ExecuteUpdateAsync(b => b.SetProperty(i => i.ProgrammeSlotId, _ => null), ct);
        }
        p.DeletedAtUtc = clock.UtcNow;
        // Null out the room→programme references too.
        await db.Rooms
            .Where(r => r.ProgrammeId == programmeId)
            .ExecuteUpdateAsync(b => b.SetProperty(r => r.ProgrammeId, _ => null), ct);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{programmeId:guid}/slots")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<ProgrammeSlotDto>> CreateSlot(Guid eventId, Guid programmeId, [FromBody] CreateSlotBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Label)) return BadRequest(new { error = "EmptyLabel" });
        if (body.DurationSec <= 0) return BadRequest(new { error = "DurationTooSmall" });
        var p = await db.Programmes
            .Include(x => x.Slots)
            .FirstOrDefaultAsync(x => x.Id == programmeId && x.EventId == eventId, ct);
        if (p is null) return NotFound();
        var nextPos = p.Slots.Count == 0 ? 0 : p.Slots.Max(s => s.Position) + 1;
        var slot = new ProgrammeSlot
        {
            Id = Guid.NewGuid(),
            TenantId = p.TenantId,
            ProgrammeId = programmeId,
            Position = nextPos,
            Label = body.Label.Trim(),
            StartUtc = body.StartUtc,
            DurationSec = body.DurationSec,
            CreatedAtUtc = clock.UtcNow,
        };
        db.ProgrammeSlots.Add(slot);
        await db.SaveChangesAsync(ct);
        return Ok(new ProgrammeSlotDto(slot.Id, slot.ProgrammeId, slot.Position, slot.Label, slot.StartUtc, slot.DurationSec, 0));
    }

    [HttpPut("{programmeId:guid}/slots/{slotId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> UpdateSlot(Guid eventId, Guid programmeId, Guid slotId, [FromBody] UpdateSlotBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Label)) return BadRequest(new { error = "EmptyLabel" });
        if (body.DurationSec <= 0) return BadRequest(new { error = "DurationTooSmall" });
        var slot = await db.ProgrammeSlots
            .Where(s => s.Id == slotId && s.ProgrammeId == programmeId && s.Programme.EventId == eventId)
            .FirstOrDefaultAsync(ct);
        if (slot is null) return NotFound();

        var timingChanged = slot.StartUtc != body.StartUtc || slot.DurationSec != body.DurationSec;
        slot.Label = body.Label.Trim();
        slot.StartUtc = body.StartUtc;
        slot.DurationSec = body.DurationSec;

        if (timingChanged)
        {
            var cascade = (body.Cascade ?? "update").ToLowerInvariant();
            if (cascade == "detach")
            {
                await db.ScheduleItems
                    .Where(i => i.ProgrammeSlotId == slotId)
                    .ExecuteUpdateAsync(b => b.SetProperty(i => i.ProgrammeSlotId, _ => null), ct);
            }
            else
            {
                // "update" — push slot timing to every linked session.
                await db.ScheduleItems
                    .Where(i => i.ProgrammeSlotId == slotId)
                    .ExecuteUpdateAsync(b => b
                        .SetProperty(i => i.ScheduledStartUtc, _ => body.StartUtc)
                        .SetProperty(i => i.DurationSec, _ => body.DurationSec), ct);
            }
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{programmeId:guid}/slots/{slotId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> DeleteSlot(Guid eventId, Guid programmeId, Guid slotId, CancellationToken ct)
    {
        var slot = await db.ProgrammeSlots
            .Where(s => s.Id == slotId && s.ProgrammeId == programmeId && s.Programme.EventId == eventId)
            .FirstOrDefaultAsync(ct);
        if (slot is null) return NotFound();

        // Detach linked sessions first to satisfy the Restrict FK.
        await db.ScheduleItems
            .Where(i => i.ProgrammeSlotId == slotId)
            .ExecuteUpdateAsync(b => b.SetProperty(i => i.ProgrammeSlotId, _ => null), ct);
        db.ProgrammeSlots.Remove(slot);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{programmeId:guid}/slots/reorder")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> ReorderSlots(Guid eventId, Guid programmeId, [FromBody] ReorderBody body, CancellationToken ct)
    {
        var slots = await db.ProgrammeSlots
            .Where(s => s.ProgrammeId == programmeId && s.Programme.EventId == eventId)
            .ToListAsync(ct);
        var ids = body.SlotIdsInOrder ?? Array.Empty<Guid>();
        if (ids.Count != slots.Count || ids.Distinct().Count() != slots.Count)
            return BadRequest(new { error = "IncompleteOrder" });
        var byId = slots.ToDictionary(s => s.Id);
        for (int i = 0; i < ids.Count; i++)
        {
            if (!byId.TryGetValue(ids[i], out var s)) return BadRequest(new { error = "UnknownSlotId" });
            s.Position = i;
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
