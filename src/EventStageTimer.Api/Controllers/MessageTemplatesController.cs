using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/templates")]
public sealed class MessageTemplatesController(AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record TemplateDto(Guid Id, string Text, int SortOrder);
    public sealed record CreateBody(string Text, int SortOrder);
    public sealed record UpdateBody(string Text, int SortOrder);

    [HttpGet]
    public async Task<IReadOnlyList<TemplateDto>> List(Guid eventId, CancellationToken ct) =>
        await db.MessageTemplates
            .Where(t => t.EventId == eventId)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Text)
            .Select(t => new TemplateDto(t.Id, t.Text, t.SortOrder))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<TemplateDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var t = new MessageTemplate
        {
            Id = Guid.NewGuid(), TenantId = ev.TenantId, EventId = eventId,
            Text = body.Text, SortOrder = body.SortOrder, CreatedAtUtc = clock.UtcNow,
        };
        db.MessageTemplates.Add(t);
        await db.SaveChangesAsync(ct);
        return Ok(new TemplateDto(t.Id, t.Text, t.SortOrder));
    }

    [HttpPut("{templateId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, Guid templateId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var t = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == templateId && x.EventId == eventId, ct);
        if (t is null) return NotFound();
        t.Text = body.Text;
        t.SortOrder = body.SortOrder;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{templateId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, Guid templateId, CancellationToken ct)
    {
        var t = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == templateId && x.EventId == eventId, ct);
        if (t is null) return NotFound();
        db.MessageTemplates.Remove(t);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
