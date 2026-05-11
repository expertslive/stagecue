namespace EventStageTimer.Api.Middleware;

/// <summary>
/// Applies a baseline of security headers to every HTTP response. Per-endpoint headers
/// (e.g. the stricter sandbox/CSP on /branding/logo) are still set inline at the endpoint.
/// </summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext ctx)
    {
        // Run on response starting so we don't overwrite endpoint-specific headers that the
        // controller has already chosen (e.g. the strict CSP on /branding/logo).
        ctx.Response.OnStarting(() =>
        {
            var h = ctx.Response.Headers;
            if (!h.ContainsKey("X-Content-Type-Options")) h.Append("X-Content-Type-Options", "nosniff");
            if (!h.ContainsKey("X-Frame-Options")) h.Append("X-Frame-Options", "DENY");
            if (!h.ContainsKey("Referrer-Policy")) h.Append("Referrer-Policy", "strict-origin-when-cross-origin");
            if (!h.ContainsKey("Permissions-Policy"))
                h.Append("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
            if (!h.ContainsKey("Strict-Transport-Security"))
                h.Append("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
            return Task.CompletedTask;
        });
        return next(ctx);
    }
}
