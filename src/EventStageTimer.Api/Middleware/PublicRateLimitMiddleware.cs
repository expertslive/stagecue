using System.Collections.Concurrent;
using System.Net;

namespace EventStageTimer.Api.Middleware;

public sealed class PublicRateLimitOptions
{
    public int RequestsPerSecond { get; set; } = 10;
    public int BurstSize { get; set; } = 30;
    public int CooldownSeconds { get; set; } = 60;
}

public sealed class PublicRateLimitMiddleware(RequestDelegate next, Microsoft.Extensions.Options.IOptions<PublicRateLimitOptions> opts, Microsoft.Extensions.Logging.ILogger<PublicRateLimitMiddleware> log)
{
    private static readonly ConcurrentDictionary<string, Bucket> Buckets = new();
    private readonly PublicRateLimitOptions _opts = opts.Value;

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (!IsPublicPath(ctx.Request.Path)) { await next(ctx); return; }

        var ip = (ctx.Connection.RemoteIpAddress ?? IPAddress.Loopback).ToString();
        var bucket = Buckets.GetOrAdd(ip, _ => new Bucket(_opts.BurstSize, _opts.RequestsPerSecond));

        if (!bucket.TryConsume(1, DateTime.UtcNow))
        {
            log.LogInformation("Rate limit hit from {Ip} on {Path}", ip, ctx.Request.Path);
            ctx.Response.StatusCode = 429;
            ctx.Response.Headers["Retry-After"] = _opts.CooldownSeconds.ToString();
            return;
        }
        await next(ctx);
    }

    private static bool IsPublicPath(PathString path)
    {
        var s = path.Value ?? "";
        return s.StartsWith("/r/", StringComparison.Ordinal)
            || s.StartsWith("/e/", StringComparison.Ordinal)
            || s.StartsWith("/hub/timer/negotiate", StringComparison.Ordinal);
    }

    private sealed class Bucket(int capacity, double refillPerSec)
    {
        private double _tokens = capacity;
        private DateTime _last = DateTime.UtcNow;
        private readonly object _lock = new();

        public bool TryConsume(int amount, DateTime nowUtc)
        {
            lock (_lock)
            {
                var elapsed = (nowUtc - _last).TotalSeconds;
                _tokens = Math.Min(capacity, _tokens + elapsed * refillPerSec);
                _last = nowUtc;
                if (_tokens < amount) return false;
                _tokens -= amount;
                return true;
            }
        }
    }
}
