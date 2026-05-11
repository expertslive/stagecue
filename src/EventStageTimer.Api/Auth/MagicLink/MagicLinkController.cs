using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace EventStageTimer.Api.Auth.MagicLink;

[ApiController]
[Route("api/auth/magic-link")]
public sealed class MagicLinkController(MagicLinkService svc, UserManager<User> users, AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record RequestBody(string Email);

    [HttpPost("request")]
    public async Task<IActionResult> RequestLink([FromBody] RequestBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Email)) return BadRequest();
        if (await users.FindByEmailAsync(body.Email) is null)
            return Ok(new { sent = true }); // don't leak whether the email is registered

        try { await svc.IssueAsync(body.Email, ct); }
        catch (EmailSendException) { return StatusCode(502, new { error = "EmailSendFailed" }); }

        return Ok(new { sent = true });
    }

    [HttpGet("consume")]
    public async Task<IActionResult> Consume([FromQuery] string token, CancellationToken ct)
    {
        var user = await svc.ConsumeAsync(token, ct);
        if (user is null) return Unauthorized();
        await SignInHelper.SignInWithTenantAsync(HttpContext, db, user, ct);
        await SignInHelper.AuditAuthAsync(db, clock, HttpContext, user.Id, "Auth.SignInSuccess",
            "{\"method\":\"MagicLink\"}", ct);
        return Ok(new { signedIn = true });
    }
}
