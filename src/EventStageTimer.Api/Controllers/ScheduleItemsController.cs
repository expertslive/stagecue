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
    public sealed record ScheduleItemDto(Guid Id, int Position, string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record CreateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record UpdateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record ReorderBody(IReadOnlyList<Guid> ItemIdsInOrder);

    [HttpGet]
    public async Task<IReadOnlyList<ScheduleItemDto>> List(Guid roomId, CancellationToken ct) =>
        await db.ScheduleItems
            .Where(s => s.RoomId == roomId)
            .OrderBy(s => s.Position)
            .Select(s => new ScheduleItemDto(s.Id, s.Position, s.Title, s.SpeakerName, s.ScheduledStartUtc, s.DurationSec, s.PreRollSec, s.AutoStart, s.ThresholdsJson))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<ScheduleItemDto>> Create(Guid roomId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room is null) return NotFound();
        var maxPos = await db.ScheduleItems.Where(s => s.RoomId == roomId).Select(s => (int?)s.Position).MaxAsync(ct) ?? 0;
        var item = new ScheduleItem
        {
            Id = Guid.NewGuid(),
            TenantId = room.TenantId,
            RoomId = roomId,
            Position = maxPos + 1,
            Title = body.Title,
            SpeakerName = body.SpeakerName,
            ScheduledStartUtc = body.ScheduledStartUtc,
            DurationSec = body.DurationSec,
            PreRollSec = body.PreRollSec,
            AutoStart = body.AutoStart,
            ThresholdsJson = body.ThresholdsJson,
            CreatedAtUtc = clock.UtcNow,
        };
        db.ScheduleItems.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(new ScheduleItemDto(item.Id, item.Position, item.Title, item.SpeakerName, item.ScheduledStartUtc, item.DurationSec, item.PreRollSec, item.AutoStart, item.ThresholdsJson));
    }

    [HttpPut("{itemId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid roomId, Guid itemId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == itemId && s.RoomId == roomId, ct);
        if (item is null) return NotFound();
        item.Title = body.Title;
        item.SpeakerName = body.SpeakerName;
        item.ScheduledStartUtc = body.ScheduledStartUtc;
        item.DurationSec = body.DurationSec;
        item.PreRollSec = body.PreRollSec;
        item.AutoStart = body.AutoStart;
        item.ThresholdsJson = body.ThresholdsJson;
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
}
