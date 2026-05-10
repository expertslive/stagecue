using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Auth;

public interface IAccessCodeGenerator
{
    Task<AccessCode> GenerateUniqueAsync(CancellationToken ct);
}

public sealed class AccessCodeGenerator(AppDbContext db) : IAccessCodeGenerator
{
    private const int MaxAttempts = 8;

    public async Task<AccessCode> GenerateUniqueAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var candidate = AccessCode.Generate();
            var taken = await db.Rooms.IgnoreQueryFilters().AnyAsync(r => r.AccessCode == candidate.Value, ct)
                     || await db.Events.IgnoreQueryFilters().AnyAsync(e => e.LobbyAccessCode == candidate.Value, ct);
            if (!taken) return candidate;
        }
        throw new InvalidOperationException($"Could not generate a unique access code after {MaxAttempts} attempts");
    }
}
