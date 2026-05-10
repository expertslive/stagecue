using Serilog.Context;

namespace EventStageTimer.Api.Observability;

/// <summary>
/// Reads X-Correlation-ID from the request (or mints one), echoes it in the response,
/// and pushes it into Serilog's LogContext so every log line for this request is tagged.
/// </summary>
public sealed class RequestCorrelationMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext ctx)
    {
        var correlationId = ctx.Request.Headers[HeaderName].FirstOrDefault() ?? Guid.NewGuid().ToString("N");
        ctx.Response.Headers[HeaderName] = correlationId;
        ctx.Items["CorrelationId"] = correlationId;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        using (LogContext.PushProperty("Path", ctx.Request.Path.Value ?? ""))
        using (LogContext.PushProperty("Method", ctx.Request.Method))
        {
            await next(ctx);
        }
    }
}
