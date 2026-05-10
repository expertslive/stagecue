using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace EventStageTimer.Api.Auth.MagicLink;

public sealed class MagicLinkService(
    AppDbContext db,
    UserManager<User> users,
    IEmailSender email,
    IClock clock,
    IConfiguration config)
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    public async Task<string> IssueAsync(string emailAddress, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(emailAddress)
                   ?? throw new InvalidOperationException("Unknown email");

        var bytes = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');

        db.AuthMagicLinks.Add(new AuthMagicLink
        {
            Token = token,
            UserId = user.Id,
            ExpiresAt = clock.UtcNow.Add(Lifetime),
        });
        await db.SaveChangesAsync(ct);

        var baseUrl = config["App:BaseUrl"] ?? "https://localhost:5001";
        var link = $"{baseUrl}/api/auth/magic-link/consume?token={Uri.EscapeDataString(token)}";

        await email.SendAsync(new EmailMessage(
            emailAddress,
            "Sign in to Event Stage Timer",
            $"<p>Click to sign in: <a href=\"{link}\">{link}</a></p><p>The link expires in 15 minutes.</p>",
            $"Sign in: {link}\nExpires in 15 minutes."), ct);

        return token; // returned for tests; not sent to controllers
    }

    public async Task<User?> ConsumeAsync(string token, CancellationToken ct)
    {
        var link = await db.AuthMagicLinks.IgnoreQueryFilters().Include(l => l.User).FirstOrDefaultAsync(l => l.Token == token, ct);
        if (link is null) return null;
        if (link.UsedAt is not null) return null;
        if (link.ExpiresAt < clock.UtcNow) return null;
        link.UsedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return link.User;
    }
}
