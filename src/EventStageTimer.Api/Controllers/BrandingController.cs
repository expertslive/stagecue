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
        // SVG is intentionally excluded — inline <script>/event handlers in SVG would
        // execute when an authenticated browser navigates to the (anonymous) /logo URL.
        if (contentType != "image/png" && contentType != "image/jpeg")
            return BadRequest(new { error = "PNG or JPEG only" });

        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();

        // Sniff magic bytes to confirm the declared Content-Type and reject forged headers.
        await using var stream = file.OpenReadStream();
        var header = new byte[12];
        var read = await stream.ReadAsync(header.AsMemory(0, header.Length), ct);
        stream.Position = 0;
        var sniffed = IsPng(header, read) ? "image/png" : IsJpeg(header, read) ? "image/jpeg" : null;
        if (sniffed is null)
            return BadRequest(new { error = "File is not a valid PNG or JPEG image" });
        if (sniffed != contentType)
            return BadRequest(new { error = $"Content-Type mismatch (header={contentType}, file={sniffed})" });

        if (ev.LogoBlobKey is { } oldKey) await files.DeleteAsync(oldKey, ct);

        var key = await files.SaveAsync(stream, sniffed, ct);
        ev.LogoBlobKey = key;
        await db.SaveChangesAsync(ct);

        return Ok(new { logoUrl = $"/api/events/{eventId}/branding/logo" });
    }

    [HttpGet("logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogo(Guid eventId, CancellationToken ct)
    {
        // System-scoped lookup: anonymous endpoint, asset is keyed only by event UUID,
        // and we still validate file existence below.
        var key = await db.Events.IgnoreQueryFilters().Where(e => e.Id == eventId).Select(e => e.LogoBlobKey).FirstOrDefaultAsync(ct);
        if (key is null) return NotFound();
        var f = await files.OpenAsync(key, ct);
        if (f is null) return NotFound();
        // Defence in depth: only ever serve image/png or image/jpeg from this endpoint.
        var ct2 = f.Value.ContentType == "image/png" || f.Value.ContentType == "image/jpeg"
            ? f.Value.ContentType
            : "application/octet-stream";
        Response.Headers.CacheControl = "public, max-age=300";
        Response.Headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; sandbox";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(f.Value.Content, ct2);
    }

    private static bool IsPng(byte[] h, int n) =>
        n >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47
              && h[4] == 0x0D && h[5] == 0x0A && h[6] == 0x1A && h[7] == 0x0A;

    private static bool IsJpeg(byte[] h, int n) =>
        n >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF;

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
