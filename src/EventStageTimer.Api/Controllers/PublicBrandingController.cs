using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
public sealed class PublicBrandingController(PublicAccessContext ctx, AppDbContext db) : ControllerBase
{
    public sealed record PublicBrandingDto(string ThemeJson, string DefaultThresholdsJson, string? LogoUrl, string EventName);

    [HttpGet("/r/{code}/branding")]
    [HttpGet("/e/{code}/branding")]
    public async Task<ActionResult<PublicBrandingDto>> Get(string code, CancellationToken ct)
    {
        if (ctx.EventId is not { } eid) return NotFound();
        var ev = await db.Events.IgnoreQueryFilters()
            .Where(e => e.Id == eid)
            .Select(e => new { e.Name, e.ThemeJson, e.DefaultThresholdsJson, e.LogoBlobKey })
            .FirstOrDefaultAsync(ct);
        if (ev is null) return NotFound();
        var logoUrl = ev.LogoBlobKey is null ? null : $"/api/events/{eid}/branding/logo";
        return Ok(new PublicBrandingDto(ev.ThemeJson, ev.DefaultThresholdsJson, logoUrl, ev.Name));
    }
}
