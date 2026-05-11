using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/rooms/{roomId:guid}/schedule")]
public sealed class ScheduleItemsController(AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record ScheduleItemDto(Guid Id, int Position, string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson, Guid? ProgrammeSlotId);
    public sealed record CreateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson, Guid? ProgrammeSlotId);
    public sealed record UpdateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson, Guid? ProgrammeSlotId);
    public sealed record ReorderBody(IReadOnlyList<Guid> ItemIdsInOrder);

    [HttpGet]
    public async Task<IReadOnlyList<ScheduleItemDto>> List(Guid roomId, CancellationToken ct) =>
        await db.ScheduleItems
            .Where(s => s.RoomId == roomId)
            .OrderBy(s => s.Position)
            .Select(s => new ScheduleItemDto(s.Id, s.Position, s.Title, s.SpeakerName, s.ScheduledStartUtc, s.DurationSec, s.PreRollSec, s.AutoStart, s.ThresholdsJson, s.ProgrammeSlotId))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<ScheduleItemDto>> Create(Guid roomId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room is null) return NotFound();
        var maxPos = await db.ScheduleItems.Where(s => s.RoomId == roomId).Select(s => (int?)s.Position).MaxAsync(ct) ?? 0;

        // When ProgrammeSlotId is set, validate the slot belongs to the room's programme and
        // overwrite the client-provided start/duration with the slot's authoritative values.
        var resolved = await ResolveSlotAsync(room, body.ProgrammeSlotId, body.ScheduledStartUtc, body.DurationSec, ct);
        if (resolved.Error is not null) return BadRequest(new { error = resolved.Error });

        var item = new ScheduleItem
        {
            Id = Guid.NewGuid(),
            TenantId = room.TenantId,
            RoomId = roomId,
            Position = maxPos + 1,
            Title = body.Title,
            SpeakerName = body.SpeakerName,
            ScheduledStartUtc = resolved.Start,
            DurationSec = resolved.DurationSec,
            PreRollSec = body.PreRollSec,
            AutoStart = body.AutoStart,
            ThresholdsJson = body.ThresholdsJson,
            ProgrammeSlotId = resolved.SlotId,
            CreatedAtUtc = clock.UtcNow,
        };
        db.ScheduleItems.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(new ScheduleItemDto(item.Id, item.Position, item.Title, item.SpeakerName, item.ScheduledStartUtc, item.DurationSec, item.PreRollSec, item.AutoStart, item.ThresholdsJson, item.ProgrammeSlotId));
    }

    [HttpPut("{itemId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid roomId, Guid itemId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == itemId && s.RoomId == roomId, ct);
        if (item is null) return NotFound();
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room is null) return NotFound();

        var resolved = await ResolveSlotAsync(room, body.ProgrammeSlotId, body.ScheduledStartUtc, body.DurationSec, ct);
        if (resolved.Error is not null) return BadRequest(new { error = resolved.Error });

        item.Title = body.Title;
        item.SpeakerName = body.SpeakerName;
        item.ScheduledStartUtc = resolved.Start;
        item.DurationSec = resolved.DurationSec;
        item.PreRollSec = body.PreRollSec;
        item.AutoStart = body.AutoStart;
        item.ThresholdsJson = body.ThresholdsJson;
        item.ProgrammeSlotId = resolved.SlotId;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("reorder")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Reorder(Guid roomId, [FromBody] ReorderBody body, CancellationToken ct)
    {
        var items = await db.ScheduleItems.Where(s => s.RoomId == roomId).ToListAsync(ct);
        var byId = items.ToDictionary(i => i.Id);
        for (var i = 0; i < body.ItemIdsInOrder.Count; i++)
            if (byId.TryGetValue(body.ItemIdsInOrder[i], out var item))
                item.Position = i + 1;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{itemId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid roomId, Guid itemId, CancellationToken ct)
    {
        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == itemId && s.RoomId == roomId, ct);
        if (item is null) return NotFound();
        item.DeletedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private sealed record SlotResolution(DateTime Start, int DurationSec, Guid? SlotId, string? Error);

    /// <summary>
    /// If `programmeSlotId` is provided, validates the slot belongs to the room's bound
    /// programme and returns the slot's authoritative start/duration. Otherwise returns the
    /// caller-provided values and a null slot reference. Returns an Error string if the slot
    /// can't be attached; the caller surfaces that as a 400.
    /// </summary>
    private async Task<SlotResolution> ResolveSlotAsync(
        Room room, Guid? programmeSlotId, DateTime fallbackStart, int fallbackDur, CancellationToken ct)
    {
        if (programmeSlotId is not { } sid) return new SlotResolution(fallbackStart, fallbackDur, null, null);
        if (room.ProgrammeId is null)
            return new SlotResolution(fallbackStart, fallbackDur, null, "RoomHasNoProgramme");
        var slot = await db.ProgrammeSlots.FirstOrDefaultAsync(s => s.Id == sid && s.ProgrammeId == room.ProgrammeId, ct);
        if (slot is null)
            return new SlotResolution(fallbackStart, fallbackDur, null, "SlotNotInRoomProgramme");
        return new SlotResolution(slot.StartUtc, slot.DurationSec, slot.Id, null);
    }
}
