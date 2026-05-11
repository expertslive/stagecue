using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Password;

[ApiController]
[Route("api/auth/password")]
public sealed class PasswordController(UserManager<User> users, AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record SignInBody(string Email, string Password);

    [HttpPost("signin")]
    public async Task<IActionResult> SignIn([FromBody] SignInBody body, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(body.Email);
        if (user is null) return Unauthorized();

        // Honor lockout: once MaxFailedAccessAttempts is exceeded the account is locked for
        // DefaultLockoutTimeSpan. We return 401 without leaking the "locked" reason so
        // attackers can't distinguish a locked account from a wrong password.
        if (await users.IsLockedOutAsync(user))
        {
            await SignInHelper.AuditAuthAsync(db, clock, HttpContext, user.Id, "Auth.SignInBlocked",
                "{\"reason\":\"LockedOut\"}", ct);
            return Unauthorized();
        }

        var ok = await users.CheckPasswordAsync(user, body.Password);
        if (!ok)
        {
            await users.AccessFailedAsync(user);
            var locked = await users.IsLockedOutAsync(user);
            await SignInHelper.AuditAuthAsync(db, clock, HttpContext, user.Id,
                locked ? "Auth.AccountLocked" : "Auth.SignInFailed",
                "{\"reason\":\"BadPassword\"}", ct);
            return Unauthorized();
        }
        await users.ResetAccessFailedCountAsync(user);

        await SignInHelper.SignInWithTenantAsync(HttpContext, db, user, ct);
        await SignInHelper.AuditAuthAsync(db, clock, HttpContext, user.Id, "Auth.SignInSuccess",
            "{\"method\":\"Password\"}", ct);
        return Ok(new { signedIn = true });
    }

    [HttpPost("signout")]
    public async Task<IActionResult> SignOutEndpoint(CancellationToken ct)
    {
        var uidStr = HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(uidStr, out var uid))
            await SignInHelper.AuditAuthAsync(db, clock, HttpContext, uid, "Auth.SignOut", "{}", ct);
        await HttpContext.SignOutAsync(IdentitySetup.SchemeName);
        return NoContent();
    }
}
