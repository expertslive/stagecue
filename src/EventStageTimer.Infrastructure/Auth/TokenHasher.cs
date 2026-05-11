using System.Security.Cryptography;
using System.Text;

namespace EventStageTimer.Infrastructure.Auth;

/// <summary>
/// SHA-256 hashing for short-lived bearer tokens (magic-link, invitation). The raw token
/// stays in the URL; only the hash is persisted, so a DB read does not yield a working
/// credential. SHA-256 (not bcrypt/argon2) is appropriate here because the input has
/// 192–256 bits of CSPRNG entropy and we need O(1) lookups by hash.
/// </summary>
public static class TokenHasher
{
    public static string Hash(string token)
    {
        var bytes = Encoding.UTF8.GetBytes(token);
        var hash = SHA256.HashData(bytes);
        return Convert.ToBase64String(hash).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}
