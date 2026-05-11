using EventStageTimer.Api.Audit;
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Password;

[ApiController]
[Route("api/auth/password")]
public sealed class PasswordController(
    UserManager<User> users,
    AppDbContext db,
    IClock clock,
    IAuditWriter audit) : ControllerBase
{
    public sealed record SignInBody(string Email, string Password);
    public sealed record ResetBody(Guid UserId, string Token, string NewPassword);

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

    /// <summary>
    /// Apply a password-reset token issued by MembersController.SendResetLink. Public endpoint —
    /// the (userId, token) pair is the proof of authorisation. The token is single-use and time-limited.
    /// Sessions are invalidated on success so other tabs / devices are kicked out.
    /// </summary>
    [HttpPost("reset")]
    [AllowAnonymous]
    public async Task<IActionResult> Reset([FromBody] ResetBody body, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(body.NewPassword))
            return BadRequest(new { error = "EmptyPassword", message = "Password is required." });

        var user = await users.FindByIdAsync(body.UserId.ToString());
        // Always return the same shape on bad userId / bad token to avoid revealing whether
        // a userId exists. Identity does this internally for ResetPasswordAsync.
        if (user is null)
            return BadRequest(new { error = "InvalidToken", message = "The reset link is no longer valid." });

        var result = await users.ResetPasswordAsync(user, body.Token, body.NewPassword);
        if (!result.Succeeded)
        {
            // Identity's errors include policy violations (too short etc.). Surface those, but
            // map token-related errors to a single opaque reason.
            var tokenError = result.Errors.Any(e => e.Code == "InvalidToken");
            if (tokenError)
                return BadRequest(new { error = "InvalidToken", message = "The reset link is no longer valid." });
            return BadRequest(new { error = "PolicyViolation", errors = result.Errors.Select(e => e.Description) });
        }

        // Force every other session for this user to re-authenticate.
        await users.UpdateSecurityStampAsync(user);
        // Clear any lockout the operator was sidestepping.
        await users.ResetAccessFailedCountAsync(user);

        // Resolve a tenant for the audit row. The user isn't signed in here so we don't have a
        // tenant context — pick the user's first TenantMembership. `IgnoreQueryFilters` because
        // the tenant filter requires CurrentTenantId which isn't set on this anonymous request.
        var tenantId = await db.TenantMemberships.IgnoreQueryFilters()
            .Where(m => m.UserId == user.Id)
            .Select(m => (Guid?)m.TenantId)
            .FirstOrDefaultAsync(ct);
        if (tenantId is { } tid)
        {
            await audit.WriteAsync(
                action: "Auth.PasswordResetCompleted",
                userId: user.Id,
                tenantId: tid,
                eventId: null,
                roomId: null,
                detailsJson: "{}",
                ct: ct);
        }
        return NoContent();
    }
}
