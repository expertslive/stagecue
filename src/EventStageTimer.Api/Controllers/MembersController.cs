using EventStageTimer.Api.Audit;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/members")]
public sealed class MembersController(
    AppDbContext db,
    UserManager<User> users,
    IEmailSender emailSender,
    IConfiguration config,
    IAuditWriter audit,
    IClock clock) : ControllerBase
{
    public sealed record MemberDto(
        Guid Id,
        Guid UserId,
        string Email,
        string? DisplayName,
        EventRole Role,
        IReadOnlyList<Guid> ScopedRoomIds,
        bool IsLocked,
        DateTime? LockoutEndUtc);

    public sealed record UpdateRoleBody(EventRole Role, IReadOnlyList<Guid>? ScopedRoomIds);
    public sealed record UpdateProfileBody(string? DisplayName, string? Email);
    public sealed record SetPasswordBody(string NewPassword);
    public sealed record LockBody(DateTime? Until);

    [HttpGet]
    public async Task<IReadOnlyList<MemberDto>> List(Guid eventId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var rows = await db.EventMemberships
            .Where(m => m.EventId == eventId)
            .Select(m => new
            {
                m.Id, m.UserId, m.Role,
                Email = m.User.Email!,
                m.User.DisplayName,
                m.User.LockoutEnd,
                ScopedRoomIds = m.ScopedRooms.Select(s => s.RoomId).ToList(),
            }).ToListAsync(ct);
        return rows
            .Select(r => new MemberDto(
                r.Id, r.UserId, r.Email, r.DisplayName, r.Role, r.ScopedRoomIds,
                IsLocked: r.LockoutEnd is { } end && end.UtcDateTime > now,
                LockoutEndUtc: r.LockoutEnd?.UtcDateTime))
            .ToList();
    }

    [HttpPut("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> UpdateRole(Guid eventId, Guid membershipId, [FromBody] UpdateRoleBody body, CancellationToken ct)
    {
        var m = await db.EventMemberships
            .Include(x => x.ScopedRooms)
            .FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();

        // Prevent demoting the last EventAdmin — would leave the event unmanageable.
        if (m.Role == EventRole.EventAdmin && body.Role != EventRole.EventAdmin)
        {
            var otherAdmins = await db.EventMemberships
                .CountAsync(x => x.EventId == eventId && x.Role == EventRole.EventAdmin && x.Id != m.Id, ct);
            if (otherAdmins == 0)
                return Conflict(new { error = "LastAdmin", message = "Cannot demote the last EventAdmin." });
        }

        m.Role = body.Role;
        m.ScopedRooms.Clear();
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { Count: > 0 } ids)
        {
            var validIds = await db.Rooms
                .Where(r => r.EventId == eventId && ids.Contains(r.Id))
                .Select(r => r.Id).ToListAsync(ct);
            if (validIds.Count != ids.Count)
                return BadRequest(new { error = "InvalidRoomIds", message = "ScopedRoomIds contains rooms not in this event." });
            foreach (var rid in validIds)
                m.ScopedRooms.Add(new EventMembershipRoom { EventMembershipId = m.Id, RoomId = rid });
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Remove(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var m = await db.EventMemberships.FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();

        if (m.Role == EventRole.EventAdmin)
        {
            var otherAdmins = await db.EventMemberships
                .CountAsync(x => x.EventId == eventId && x.Role == EventRole.EventAdmin && x.Id != m.Id, ct);
            if (otherAdmins == 0)
                return Conflict(new { error = "LastAdmin", message = "Cannot remove the last EventAdmin." });
        }

        db.EventMemberships.Remove(m);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Sends a password-reset email to the member. The link contains a single-use, time-limited
    /// Identity password-reset token. The admin never sees the token; the member sets their own
    /// new password via /reset-password/&lt;token&gt; on the SPA.
    /// </summary>
    [HttpPost("{membershipId:guid}/reset-link")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> SendResetLink(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var (user, ev) = await LoadMemberAndEventAsync(eventId, membershipId, ct);
        if (user is null || ev is null) return NotFound();

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var encoded = Uri.EscapeDataString(token);
        var baseUrl = config["App:BaseUrl"] ?? "";
        var link = $"{baseUrl}/reset-password/{user.Id}/{encoded}";

        var subject = $"Reset your Stagecue password";
        var bodyHtml = $"<p>An administrator of <b>{ev.Name}</b> requested a password reset for your Stagecue account.</p>" +
                       $"<p>Set a new password: <a href=\"{link}\">{link}</a></p>" +
                       $"<p>This link expires in 1 hour. If you didn't expect this email, you can ignore it.</p>";
        var bodyText = $"An administrator of {ev.Name} requested a password reset for your Stagecue account.\nSet a new password: {link}\nThis link expires in 1 hour.";

        var sendOk = true;
        try
        {
            await emailSender.SendAsync(new EmailMessage(user.Email!, subject, bodyHtml, bodyText), ct);
        }
        catch (EmailSendException)
        {
            sendOk = false;
        }

        await audit.WriteAsync(
            action: "Member.PasswordResetLink",
            userId: GetCurrentUserId(),
            tenantId: ev.TenantId,
            eventId: eventId,
            roomId: null,
            detailsJson: JsonSerializer.Serialize(new { targetUserId = user.Id, emailSent = sendOk }),
            ct: ct);

        return Ok(new { emailSent = sendOk });
    }

    /// <summary>
    /// Admin force-sets a member's password directly. Used when email is unavailable and the
    /// admin is communicating the temp password out-of-band. The admin types the password into
    /// a confirm dialog; the member changes it themselves once signed in. Audit-logged.
    /// </summary>
    [HttpPost("{membershipId:guid}/temp-password")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> SetTempPassword(Guid eventId, Guid membershipId, [FromBody] SetPasswordBody body, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(body.NewPassword))
            return BadRequest(new { error = "EmptyPassword", message = "Password is required." });

        var (user, ev) = await LoadMemberAndEventAsync(eventId, membershipId, ct);
        if (user is null || ev is null) return NotFound();

        // Remove + add lets Identity validate against the configured PasswordOptions
        // (length, complexity) and surfaces the policy errors back to the admin.
        var removeResult = await users.RemovePasswordAsync(user);
        if (!removeResult.Succeeded)
            return BadRequest(new { error = "RemoveFailed", errors = removeResult.Errors.Select(e => e.Description) });

        var addResult = await users.AddPasswordAsync(user, body.NewPassword);
        if (!addResult.Succeeded)
            return BadRequest(new { error = "PolicyViolation", errors = addResult.Errors.Select(e => e.Description) });

        // Force the user's existing sign-in sessions to invalidate next request.
        await users.UpdateSecurityStampAsync(user);

        await audit.WriteAsync(
            action: "Member.PasswordSetByAdmin",
            userId: GetCurrentUserId(),
            tenantId: ev.TenantId,
            eventId: eventId,
            roomId: null,
            detailsJson: JsonSerializer.Serialize(new { targetUserId = user.Id }),
            ct: ct);

        return NoContent();
    }

    /// <summary>
    /// Updates display name and/or email. Changing email re-syncs UserName (used for sign-in)
    /// and forces other sessions to re-authenticate.
    /// </summary>
    [HttpPut("{membershipId:guid}/profile")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> UpdateProfile(Guid eventId, Guid membershipId, [FromBody] UpdateProfileBody body, CancellationToken ct)
    {
        var (user, ev) = await LoadMemberAndEventAsync(eventId, membershipId, ct);
        if (user is null || ev is null) return NotFound();

        var changes = new List<string>();

        if (body.DisplayName is not null && body.DisplayName != user.DisplayName)
        {
            user.DisplayName = string.IsNullOrWhiteSpace(body.DisplayName) ? null : body.DisplayName.Trim();
            changes.Add("displayName");
        }

        if (body.Email is not null && !string.Equals(body.Email, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            var trimmed = body.Email.Trim();
            if (string.IsNullOrEmpty(trimmed))
                return BadRequest(new { error = "EmptyEmail", message = "Email cannot be empty." });

            // Reject duplicates: Identity treats Email as a sign-in identifier and we use it
            // as UserName too. A clash would cause sign-in ambiguity.
            var existing = await users.FindByEmailAsync(trimmed);
            if (existing is not null && existing.Id != user.Id)
                return Conflict(new { error = "EmailTaken", message = "Another account is using this email." });

            var setEmail = await users.SetEmailAsync(user, trimmed);
            if (!setEmail.Succeeded)
                return BadRequest(new { error = "InvalidEmail", errors = setEmail.Errors.Select(e => e.Description) });
            var setUser = await users.SetUserNameAsync(user, trimmed);
            if (!setUser.Succeeded)
                return BadRequest(new { error = "InvalidUserName", errors = setUser.Errors.Select(e => e.Description) });
            await users.UpdateSecurityStampAsync(user);
            changes.Add("email");
        }

        if (changes.Count == 0) return NoContent();

        await db.SaveChangesAsync(ct);
        await audit.WriteAsync(
            action: "Member.ProfileUpdated",
            userId: GetCurrentUserId(),
            tenantId: ev.TenantId,
            eventId: eventId,
            roomId: null,
            detailsJson: JsonSerializer.Serialize(new { targetUserId = user.Id, fields = changes }),
            ct: ct);
        return NoContent();
    }

    /// <summary>
    /// Locks the member's account so they can no longer sign in. Pass `until` to lock until a
    /// specific UTC instant; omit for an effectively permanent lock (year 9999).
    /// </summary>
    [HttpPost("{membershipId:guid}/lock")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Lock(Guid eventId, Guid membershipId, [FromBody] LockBody body, CancellationToken ct)
    {
        var (user, ev) = await LoadMemberAndEventAsync(eventId, membershipId, ct);
        if (user is null || ev is null) return NotFound();

        var until = body.Until ?? new DateTime(9999, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var result = await users.SetLockoutEndDateAsync(user, new DateTimeOffset(until, TimeSpan.Zero));
        if (!result.Succeeded)
            return BadRequest(new { error = "LockFailed", errors = result.Errors.Select(e => e.Description) });
        await users.UpdateSecurityStampAsync(user);

        await audit.WriteAsync(
            action: "Member.AccountLocked",
            userId: GetCurrentUserId(),
            tenantId: ev.TenantId,
            eventId: eventId,
            roomId: null,
            detailsJson: JsonSerializer.Serialize(new { targetUserId = user.Id, until }),
            ct: ct);
        return NoContent();
    }

    [HttpPost("{membershipId:guid}/unlock")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Unlock(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var (user, ev) = await LoadMemberAndEventAsync(eventId, membershipId, ct);
        if (user is null || ev is null) return NotFound();

        var result = await users.SetLockoutEndDateAsync(user, null);
        if (!result.Succeeded)
            return BadRequest(new { error = "UnlockFailed", errors = result.Errors.Select(e => e.Description) });
        await users.ResetAccessFailedCountAsync(user);

        await audit.WriteAsync(
            action: "Member.AccountUnlocked",
            userId: GetCurrentUserId(),
            tenantId: ev.TenantId,
            eventId: eventId,
            roomId: null,
            detailsJson: JsonSerializer.Serialize(new { targetUserId = user.Id }),
            ct: ct);
        return NoContent();
    }

    /// <summary>Small carrier for the values we need from the surrounding event when writing audit / email.</summary>
    private sealed record EventContext(Guid TenantId, string Name);

    private async Task<(User?, EventContext?)> LoadMemberAndEventAsync(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var row = await db.EventMemberships
            .Where(m => m.Id == membershipId && m.EventId == eventId)
            .Select(m => new { m.UserId, TenantId = m.Event.TenantId, EventName = m.Event.Name })
            .FirstOrDefaultAsync(ct);
        if (row is null) return (null, null);
        var user = await users.FindByIdAsync(row.UserId.ToString());
        if (user is null) return (null, null);
        return (user, new EventContext(row.TenantId, row.EventName));
    }

    private Guid? GetCurrentUserId()
    {
        var s = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);
        return Guid.TryParse(s, out var g) ? g : null;
    }
}
