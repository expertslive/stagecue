using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class InvitationsController(
    AppDbContext db,
    IClock clock,
    IEmailSender email,
    IConfiguration config,
    UserManager<User> users) : ControllerBase
{
    public sealed record InvitationDto(Guid Id, string Email, EventRole Role, IReadOnlyList<Guid> ScopedRoomIds, DateTime ExpiresAt, DateTime? AcceptedAt, bool EmailSendFailed, string AcceptUrl);
    public sealed record CreateBody(string Email, EventRole Role, IReadOnlyList<Guid>? ScopedRoomIds);
    public sealed record AcceptInfo(string EventName, EventRole Role);

    [HttpGet("events/{eventId:guid}/invitations")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IReadOnlyList<InvitationDto>> List(Guid eventId, CancellationToken ct)
    {
        var rows = await db.Invitations
            .Where(i => i.EventId == eventId && i.AcceptedAt == null)
            .Select(i => new
            {
                i.Id, i.Email, i.Role, i.Token, i.ExpiresAt, i.AcceptedAt, i.EmailSendFailed,
                ScopedRoomIds = i.ScopedRooms.Select(s => s.RoomId).ToList(),
            }).ToListAsync(ct);
        var baseUrl = config["App:BaseUrl"] ?? "";
        return rows.Select(r => new InvitationDto(r.Id, r.Email, r.Role, r.ScopedRoomIds, r.ExpiresAt, r.AcceptedAt, r.EmailSendFailed, $"{baseUrl}/invitations/{r.Token}")).ToList();
    }

    [HttpPost("events/{eventId:guid}/invitations")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<InvitationDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        var inv = new Invitation
        {
            Id = Guid.NewGuid(), TenantId = ev.TenantId, EventId = eventId,
            Email = body.Email.ToLowerInvariant(), Role = body.Role,
            Token = token, ExpiresAt = clock.UtcNow.AddDays(7), CreatedAtUtc = clock.UtcNow,
        };
        db.Invitations.Add(inv);
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { } ids)
        {
            foreach (var rid in ids)
                db.InvitationRooms.Add(new InvitationRoom { InvitationId = inv.Id, RoomId = rid });
        }

        var baseUrl = config["App:BaseUrl"] ?? "";
        var link = $"{baseUrl}/invitations/{token}";
        try
        {
            await email.SendAsync(new EmailMessage(
                inv.Email,
                $"You're invited to {ev.Name}",
                $"<p>You've been invited to join <b>{ev.Name}</b> as <b>{body.Role}</b>.</p><p>Accept: <a href=\"{link}\">{link}</a></p><p>This link expires in 7 days.</p>",
                $"You've been invited to join {ev.Name} as {body.Role}.\nAccept: {link}\nExpires in 7 days."), ct);
        }
        catch (EmailSendException) { inv.EmailSendFailed = true; }

        await db.SaveChangesAsync(ct);
        return Ok(new InvitationDto(inv.Id, inv.Email, inv.Role, body.ScopedRoomIds ?? Array.Empty<Guid>(), inv.ExpiresAt, null, inv.EmailSendFailed, link));
    }

    [HttpDelete("events/{eventId:guid}/invitations/{invitationId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Revoke(Guid eventId, Guid invitationId, CancellationToken ct)
    {
        var inv = await db.Invitations.FirstOrDefaultAsync(i => i.Id == invitationId && i.EventId == eventId, ct);
        if (inv is null) return NotFound();
        db.Invitations.Remove(inv);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("invitations/{token}/info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetInfo(string token, CancellationToken ct)
    {
        var inv = await db.Invitations.IgnoreQueryFilters()
            .Where(i => i.Token == token)
            .Select(i => new { i.Email, i.Role, i.ExpiresAt, i.AcceptedAt, EventName = i.Event.Name })
            .FirstOrDefaultAsync(ct);
        if (inv is null) return NotFound();
        if (inv.AcceptedAt is not null) return Conflict(new { error = "AlreadyAccepted" });
        if (inv.ExpiresAt < clock.UtcNow) return Gone();
        return Ok(new AcceptInfo(inv.EventName, inv.Role));
    }

    [HttpPost("invitations/{token}/accept")]
    [Authorize]
    public async Task<IActionResult> Accept(string token, CancellationToken ct)
    {
        var inv = await db.Invitations.IgnoreQueryFilters()
            .Include(i => i.ScopedRooms)
            .FirstOrDefaultAsync(i => i.Token == token, ct);
        if (inv is null) return NotFound();
        if (inv.AcceptedAt is not null) return Conflict(new { error = "AlreadyAccepted" });
        if (inv.ExpiresAt < clock.UtcNow) return Gone();

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await users.FindByIdAsync(userId.ToString());
        if (user?.Email is null || !string.Equals(user.Email, inv.Email, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var membership = new EventMembership
        {
            Id = Guid.NewGuid(), TenantId = inv.TenantId, EventId = inv.EventId,
            UserId = userId, Role = inv.Role, CreatedAtUtc = clock.UtcNow,
        };
        db.EventMemberships.Add(membership);
        if (inv.Role == EventRole.RoomOperator)
        {
            foreach (var sr in inv.ScopedRooms)
                db.EventMembershipRooms.Add(new EventMembershipRoom { EventMembershipId = membership.Id, RoomId = sr.RoomId });
        }
        inv.AcceptedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { eventId = inv.EventId });
    }

    private static IActionResult Gone() => new ObjectResult(new { error = "Expired" }) { StatusCode = 410 };
}
