using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Auth.Bootstrap;

[ApiController]
[Route("api/setup")]
public sealed class BootstrapController(
    AppDbContext db,
    UserManager<User> users,
    IClock clock) : ControllerBase
{
    public sealed record SetupBody(string TenantName, string TenantSlug, string OwnerEmail, string OwnerPassword, string OwnerDisplayName);

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var hasTenant = await db.Tenants.IgnoreQueryFilters().AnyAsync(ct);
        return Ok(new { initialized = hasTenant });
    }

    [HttpPost("initialize")]
    public async Task<IActionResult> Initialize([FromBody] SetupBody body, CancellationToken ct)
    {
        if (await db.Tenants.IgnoreQueryFilters().AnyAsync(ct))
            return Conflict(new { error = "AlreadyInitialized" });

        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = body.TenantName,
            Slug = body.TenantSlug,
            Mode = TenantMode.SelfHost,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Tenants.Add(tenant);

        var user = new User
        {
            Id = Guid.NewGuid(),
            UserName = body.OwnerEmail,
            Email = body.OwnerEmail,
            DisplayName = body.OwnerDisplayName,
            CreatedAtUtc = clock.UtcNow,
        };
        var createResult = await users.CreateAsync(user, body.OwnerPassword);
        if (!createResult.Succeeded) return BadRequest(new { errors = createResult.Errors });

        db.TenantMemberships.Add(new TenantMembership
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            UserId = user.Id,
            Role = TenantRole.Owner,
            CreatedAtUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return Ok(new { tenantId = tenant.Id, userId = user.Id });
    }
}
