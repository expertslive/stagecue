using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
public sealed class PublicInfoController(PublicAccessContext ctx, AppDbContext db) : ControllerBase
{
    public sealed record RoomInfo(Guid RoomId, string RoomName, Guid EventId, string EventName);
    public sealed record LobbyInfo(Guid EventId, string EventName, IReadOnlyList<LobbyRoom> Rooms);
    public sealed record LobbyRoom(Guid Id, string Name);

    [HttpGet("/r/{code}/info")]
    public async Task<ActionResult<RoomInfo>> GetRoom(string code, CancellationToken ct)
    {
        if (ctx.RoomId is not { } rid) return NotFound();
        var info = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.Id == rid)
            .Select(r => new RoomInfo(r.Id, r.Name, r.EventId, r.Event.Name))
            .FirstOrDefaultAsync(ct);
        return info is null ? NotFound() : Ok(info);
    }

    /// <summary>Kept for the existing AccessCodeLookupTests assertions.</summary>
    [HttpGet("/r/{code}/ping")]
    public IActionResult Ping(string code) => Ok(new { roomId = ctx.RoomId, eventId = ctx.EventId });

    [HttpGet("/e/{code}/info")]
    public async Task<ActionResult<LobbyInfo>> GetLobby(string code, CancellationToken ct)
    {
        if (!ctx.IsLobbyCode || ctx.EventId is not { } eid) return NotFound();
        var ev = await db.Events
            .IgnoreQueryFilters()
            .Where(e => e.Id == eid)
            .Select(e => new { e.Id, e.Name })
            .FirstOrDefaultAsync(ct);
        if (ev is null) return NotFound();
        var rooms = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.EventId == eid)
            .OrderBy(r => r.Name)
            .Select(r => new LobbyRoom(r.Id, r.Name))
            .ToListAsync(ct);
        return Ok(new LobbyInfo(ev.Id, ev.Name, rooms));
    }
}
