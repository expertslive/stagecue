using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;

namespace EventStageTimer.Api.Auth.Identity;

public static class IdentitySetup
{
    public const string SchemeName = CookieAuthenticationDefaults.AuthenticationScheme;

    public static IServiceCollection AddAppIdentity(this IServiceCollection services, IConfiguration config)
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
                opts.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                opts.Cookie.SameSite = SameSiteMode.Lax;
                opts.ExpireTimeSpan = TimeSpan.FromHours(12);
                opts.SlidingExpiration = true;
                opts.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
                opts.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
            })
            .AddScheme<EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthOptions, EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler>(
                EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler.SchemeName, _ => { });

        services.AddAuthorization();
        return services;
    }
}
