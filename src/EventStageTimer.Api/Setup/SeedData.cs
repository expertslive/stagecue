using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Auth;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace EventStageTimer.Api.Setup;

public static class SeedData
{
    public sealed record SeededIds(Guid TenantId, Guid OwnerUserId, Guid EventId, Guid RoomId, Guid ScheduleItemId, string RoomAccessCode, string LobbyAccessCode);

    public static async Task<SeededIds> CreateMinimalAsync(IServiceProvider services, string ownerEmail = "owner@local", string ownerPassword = "Strong_Pwd_123", CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        var codes = scope.ServiceProvider.GetRequiredService<IAccessCodeGenerator>();
        var now = clock.UtcNow;

        var tenant = new Tenant { Id = Guid.NewGuid(), Name = "Demo", Slug = "demo", Mode = TenantMode.SelfHost, CreatedAtUtc = now };
        db.Tenants.Add(tenant);

        var owner = new User { Id = Guid.NewGuid(), Email = ownerEmail, UserName = ownerEmail, DisplayName = "Owner", CreatedAtUtc = now };
        var createResult = await users.CreateAsync(owner, ownerPassword);
        if (!createResult.Succeeded)
            throw new InvalidOperationException(string.Join("; ", createResult.Errors.Select(e => e.Description)));

        db.TenantMemberships.Add(new TenantMembership { Id = Guid.NewGuid(), TenantId = tenant.Id, UserId = owner.Id, Role = TenantRole.Owner, CreatedAtUtc = now });

        var lobbyCode = await codes.GenerateUniqueAsync(ct);
        var ev = new Event
        {
            Id = Guid.NewGuid(), TenantId = tenant.Id, Name = "Demo Conference",
            TimeZone = "Europe/Amsterdam", StartsAtUtc = now, EndsAtUtc = now.AddHours(8),
            LobbyAccessCode = lobbyCode.Value, CreatedAtUtc = now,
        };
        db.Events.Add(ev);
        db.EventMemberships.Add(new EventMembership { Id = Guid.NewGuid(), TenantId = tenant.Id, EventId = ev.Id, UserId = owner.Id, Role = EventRole.EventAdmin, CreatedAtUtc = now });

        var roomCode = await codes.GenerateUniqueAsync(ct);
        var room = new Room { Id = Guid.NewGuid(), TenantId = tenant.Id, EventId = ev.Id, Name = "Main Hall", AccessCode = roomCode.Value, DefaultPreRollSec = 30, CreatedAtUtc = now };
        db.Rooms.Add(room);
        db.RoomTimerStates.Add(new RoomTimerState { RoomId = room.Id, TenantId = tenant.Id, Phase = TimerPhase.Idle });

        var item = new ScheduleItem
        {
            Id = Guid.NewGuid(), TenantId = tenant.Id, RoomId = room.Id, Position = 1,
            Title = "Keynote", SpeakerName = "Ada Lovelace", ScheduledStartUtc = now.AddMinutes(5),
            DurationSec = 1800, PreRollSec = 30, AutoStart = false,
            ThresholdsJson = "[{\"secondsRemaining\":600,\"colorToken\":\"warning\"},{\"secondsRemaining\":120,\"colorToken\":\"danger\"}]",
            CreatedAtUtc = now,
        };
        db.ScheduleItems.Add(item);

        await db.SaveChangesAsync(ct);
        return new SeededIds(tenant.Id, owner.Id, ev.Id, room.Id, item.Id, roomCode.Value, lobbyCode.Value);
    }
}
