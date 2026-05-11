using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

namespace EventStageTimer.Api.Auth.Identity;

public static class IdentitySetup
{
    public const string SchemeName = CookieAuthenticationDefaults.AuthenticationScheme;
    public const string SecurityStampClaim = "AspNet.Identity.SecurityStamp";

    public static IServiceCollection AddAppIdentity(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        services.AddHttpContextAccessor();

        services.AddIdentityCore<User>(o =>
        {
            o.Password.RequireDigit = true;
            o.Password.RequireLowercase = true;
            o.Password.RequireUppercase = false;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequiredLength = 10;
            o.User.RequireUniqueEmail = true;
            o.SignIn.RequireConfirmedEmail = false;
            // Brute-force defense: lock after 5 consecutive failed attempts for 15 minutes.
            o.Lockout.MaxFailedAccessAttempts = 5;
            o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            o.Lockout.AllowedForNewUsers = true;
        })
        .AddRoles<IdentityRole<Guid>>()
        .AddEntityFrameworkStores<AppDbContext>()
        .AddDefaultTokenProviders()
        .AddSignInManager();

        services.AddScoped<EventStageTimer.Api.Auth.Public.PublicAccessContext>();

        services.AddAuthentication(SchemeName)
            .AddCookie(SchemeName, opts =>
            {
                opts.Cookie.Name = "est.session";
                opts.Cookie.HttpOnly = true;
                // Production runs behind HTTPS-terminating ingress; dev runs on plain
                // localhost so we relax Secure to SameAsRequest, otherwise the browser
                // silently drops the set-cookie on http://localhost.
                opts.Cookie.SecurePolicy = env.IsDevelopment() || env.IsEnvironment("Testing")
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                opts.Cookie.SameSite = SameSiteMode.Lax;
                opts.ExpireTimeSpan = TimeSpan.FromHours(12);
                opts.SlidingExpiration = true;
                opts.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
                opts.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
                // Custom security-stamp validation: reject the cookie if the user's stamp
                // has changed since sign-in (e.g. after a password reset). We do this inline
                // rather than via SecurityStampValidator because the latter expects ALL of
                // Identity's auxiliary schemes (TwoFactorRememberMe, External, etc.) to be
                // registered, and pulls Identity.SignInManager.SignOutAsync which would 500.
                opts.Events.OnValidatePrincipal = SecurityStampPrincipalValidator.ValidateAsync;
            })
            .AddScheme<EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthOptions, EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler>(
                EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler.SchemeName, _ => { });

        services.AddAuthorization();
        return services;
    }
}
