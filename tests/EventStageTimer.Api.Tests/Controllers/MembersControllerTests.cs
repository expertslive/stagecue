using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Controllers;

[Collection("sqlserver")]
public sealed class MembersControllerTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Cannot_demote_last_EventAdmin()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var members = await ListMembers(seeded.EventId);
        var owner = members.Single();

        var resp = await _http.PutAsJsonAsync(
            $"/api/events/{seeded.EventId}/members/{owner.Id}",
            new { Role = EventRole.Viewer, ScopedRoomIds = (Guid[]?)null });

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("LastAdmin");
    }

    [Fact]
    public async Task Cannot_remove_last_EventAdmin()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);
        var members = await ListMembers(seeded.EventId);
        var owner = members.Single();

        var resp = await _http.DeleteAsync($"/api/events/{seeded.EventId}/members/{owner.Id}");

        resp.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("error").GetString().Should().Be("LastAdmin");
    }

    [Fact]
    public async Task Can_demote_admin_when_another_admin_exists()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        Guid secondAdminMembershipId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var u = new User { Id = Guid.NewGuid(), Email = "admin2@t.local", UserName = "admin2@t.local", DisplayName = "Admin2", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(u, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var m = new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = u.Id, Role = EventRole.EventAdmin, CreatedAtUtc = DateTime.UtcNow,
            };
            db.EventMemberships.Add(m);
            await db.SaveChangesAsync();
            secondAdminMembershipId = m.Id;
        }

        var resp = await _http.PutAsJsonAsync(
            $"/api/events/{seeded.EventId}/members/{secondAdminMembershipId}",
            new { Role = EventRole.Viewer, ScopedRoomIds = (Guid[]?)null });

        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Can_remove_non_admin_member()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        Guid viewerMembershipId;
        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<User>>();
            var u = new User { Id = Guid.NewGuid(), Email = "viewer@t.local", UserName = "viewer@t.local", DisplayName = "V", CreatedAtUtc = DateTime.UtcNow };
            (await users.CreateAsync(u, "Strong_Pwd_123")).Succeeded.Should().BeTrue();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var m = new EventMembership
            {
                Id = Guid.NewGuid(), TenantId = seeded.TenantId, EventId = seeded.EventId,
                UserId = u.Id, Role = EventRole.Viewer, CreatedAtUtc = DateTime.UtcNow,
            };
            db.EventMemberships.Add(m);
            await db.SaveChangesAsync();
            viewerMembershipId = m.Id;
        }

        var resp = await _http.DeleteAsync($"/api/events/{seeded.EventId}/members/{viewerMembershipId}");
        resp.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private async Task<IReadOnlyList<MemberRow>> ListMembers(Guid eventId)
    {
        var resp = await _http.GetAsync($"/api/events/{eventId}/members");
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<List<MemberRow>>(TestJsonOptions.Default))!;
    }

    private sealed record MemberRow(Guid Id, Guid UserId, string Email, string? DisplayName, EventRole Role, IReadOnlyList<Guid> ScopedRoomIds);
}
