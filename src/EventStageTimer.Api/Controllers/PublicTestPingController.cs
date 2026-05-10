using EventStageTimer.Api.Auth.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EventStageTimer.Api.Controllers;

/// <summary>
/// Test-only access-code probe endpoint used by integration tests until the real
/// public branding endpoint arrives in Plan 4. Resolves the access code via the
/// PublicAccessCode auth scheme and returns the room/event ids.
/// </summary>
[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
[Route("r/{code}")]
public sealed class PublicTestPingController(PublicAccessContext ctx) : ControllerBase
{
    [HttpGet("ping")]
    public IActionResult Ping() => Ok(new { roomId = ctx.RoomId, eventId = ctx.EventId });
}
