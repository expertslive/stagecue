using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace EventStageTimer.Api.Auth.Password;

[ApiController]
[Route("api/auth/password")]
public sealed class PasswordController(UserManager<User> users, AppDbContext db) : ControllerBase
{
    public sealed record SignInBody(string Email, string Password);

    [HttpPost("signin")]
    public async Task<IActionResult> SignIn([FromBody] SignInBody body, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(body.Email);
        if (user is null) return Unauthorized();

        var ok = await users.CheckPasswordAsync(user, body.Password);
        if (!ok) return Unauthorized();

        await SignInHelper.SignInWithTenantAsync(HttpContext, db, user, ct);
        return Ok(new { signedIn = true });
    }

    [HttpPost("signout")]
    public async Task<IActionResult> SignOutEndpoint()
    {
        await HttpContext.SignOutAsync(IdentitySetup.SchemeName);
        return NoContent();
    }
}
