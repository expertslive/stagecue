using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace EventStageTimer.Api.Auth.Bootstrap;

[ApiController]
[Route("api/setup")]
public sealed class BootstrapController(
    AppDbContext db,
    UserManager<User> users,
    IClock clock,
    IConfiguration config,
    IHostEnvironment env) : ControllerBase
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
        // Prevent tenant takeover after a DB restore / failover: in non-development environments,
        // /initialize must present the operator-only Setup:InitSecret via the X-Setup-Secret
        // header. Development / Testing skip the check so local bootstrap + integration tests
        // continue to work without ceremony.
        var configuredSecret = config["Setup:InitSecret"];
        var requireSecret = !(env.IsDevelopment() || env.IsEnvironment("Testing"));
        if (requireSecret)
        {
            if (string.IsNullOrEmpty(configuredSecret))
                return Problem(statusCode: 503, title: "SetupNotConfigured",
                    detail: "Setup:InitSecret must be set in production environments before /initialize can be called.");
            var presented = Request.Headers["X-Setup-Secret"].ToString();
            if (string.IsNullOrEmpty(presented) || !FixedTimeEquals(presented, configuredSecret))
                return Unauthorized();
        }

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

    private static bool FixedTimeEquals(string a, string b)
    {
        var ab = Encoding.UTF8.GetBytes(a);
        var bb = Encoding.UTF8.GetBytes(b);
        return ab.Length == bb.Length && CryptographicOperations.FixedTimeEquals(ab, bb);
    }
}
