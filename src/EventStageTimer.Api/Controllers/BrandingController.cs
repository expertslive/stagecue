using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/branding")]
public sealed class BrandingController(AppDbContext db, IFileStorage files) : ControllerBase
{
    public sealed record BrandingDto(string ThemeJson, string DefaultThresholdsJson, string? LogoUrl);
    public sealed record UpdateThemeBody(string ThemeJson, string DefaultThresholdsJson);

    [HttpGet]
    public async Task<ActionResult<BrandingDto>> Get(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var logoUrl = ev.LogoBlobKey is null ? null : $"/api/events/{eventId}/branding/logo";
        return Ok(new BrandingDto(ev.ThemeJson, ev.DefaultThresholdsJson, logoUrl));
    }

    [HttpPut]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, [FromBody] UpdateThemeBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.ThemeJson = string.IsNullOrWhiteSpace(body.ThemeJson) ? "{}" : body.ThemeJson;
        ev.DefaultThresholdsJson = string.IsNullOrWhiteSpace(body.DefaultThresholdsJson) ? "[]" : body.DefaultThresholdsJson;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("logo")]
    [Authorize(Policy = "EventAdmin")]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(Guid eventId, IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "No file" });
        if (file.Length > 2 * 1024 * 1024) return BadRequest(new { error = "Max 2MB" });
        var contentType = file.ContentType?.ToLowerInvariant() ?? "";
        if (contentType != "image/png" && contentType != "image/svg+xml" && contentType != "image/jpeg")
            return BadRequest(new { error = "PNG, SVG, or JPEG only" });

        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();

        if (ev.LogoBlobKey is { } oldKey) await files.DeleteAsync(oldKey, ct);

        await using var stream = file.OpenReadStream();
        var key = await files.SaveAsync(stream, contentType, ct);
        ev.LogoBlobKey = key;
        await db.SaveChangesAsync(ct);

        return Ok(new { logoUrl = $"/api/events/{eventId}/branding/logo" });
    }

    [HttpGet("logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogo(Guid eventId, CancellationToken ct)
    {
        var key = await db.Events.IgnoreQueryFilters().Where(e => e.Id == eventId).Select(e => e.LogoBlobKey).FirstOrDefaultAsync(ct);
        if (key is null) return NotFound();
        var f = await files.OpenAsync(key, ct);
        if (f is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=300";
        return File(f.Value.Content, f.Value.ContentType);
    }

    [HttpDelete("logo")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> RemoveLogo(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        if (ev.LogoBlobKey is { } k) { await files.DeleteAsync(k, ct); ev.LogoBlobKey = null; }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
