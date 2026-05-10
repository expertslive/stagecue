using System.Security.Cryptography;

namespace EventStageTimer.Domain.Common;

/// <summary>
/// 8-character base32-safe public access code (A–Z plus 2–9, omitting 0/1/I/O).
/// Stored without dashes; displayed and parsed as <c>XXXX-XXXX</c>.
/// </summary>
public readonly record struct AccessCode
{
    public const int Length = 8;
    public const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public string Value { get; }

    private AccessCode(string value) => Value = value;

    public string Formatted => $"{Value[..4]}-{Value[4..]}";

    public static AccessCode From(string raw)
    {
        if (!TryParse(raw, out var code))
            throw new ArgumentException($"'{raw}' is not a valid access code", nameof(raw));
        return code;
    }

    public static bool TryParse(string? input, out AccessCode code)
    {
        code = default;
        if (string.IsNullOrEmpty(input)) return false;

        var stripped = input.Replace("-", "", StringComparison.Ordinal).ToUpperInvariant();
        if (stripped.Length != Length) return false;

        foreach (var ch in stripped)
            if (Alphabet.IndexOf(ch) < 0) return false;

        // If the input had a dash, it must be in the canonical position.
        if (input.Contains('-') && !(input.IndexOf('-') == 4 && input.Length == Length + 1))
            return false;

        code = new AccessCode(stripped);
        return true;
    }

    public static AccessCode Generate()
    {
        Span<byte> buffer = stackalloc byte[Length];
        var chars = new char[Length];
        // Reject-sample to avoid modulo bias on a 32-char alphabet (256 % 32 == 0, so unbiased — but be explicit).
        for (var i = 0; i < Length; i++)
        {
            RandomNumberGenerator.Fill(buffer.Slice(i, 1));
            chars[i] = Alphabet[buffer[i] & 0x1F];
        }
        return new AccessCode(new string(chars));
    }

    public override string ToString() => Formatted;
}
