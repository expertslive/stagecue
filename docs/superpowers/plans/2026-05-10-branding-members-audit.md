# Branding + Members + Invitations + Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-event branding (theme tokens with defaults, logo upload), member management with email invitations, and an audit log viewer.

**Architecture:** Backend gains an `IFileStorage` abstraction (`LocalFileStorage` impl now, `AzureBlobStorage` deferred to Plan 5) plus four new controllers (branding, public branding, members, invitations, audit). Frontend gains theme defaults + applyTheme + a `useBranding` hook that public views call to fetch the merged token map and logo URL, plus admin pages for branding, members, and audit log.

**Tech Stack additions:** None on backend (uses `Microsoft.AspNetCore.Http` form upload). Frontend reuses existing stack.

**Spec reference:** §4.1 (members, invitations, audit), §10 (branding), §11 (access codes — already done).

---

## Task 1: `IFileStorage` + `LocalFileStorage`

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Storage/IFileStorage.cs`
- Create: `src/EventStageTimer.Infrastructure/Storage/LocalFileStorage.cs`

```csharp
// IFileStorage.cs
namespace EventStageTimer.Infrastructure.Storage;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct);
    Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct);
    Task DeleteAsync(string key, CancellationToken ct);
}

public sealed class LocalFileStorageOptions
{
    public string Root { get; set; } = "./uploads";
}
```

```csharp
// LocalFileStorage.cs
using Microsoft.Extensions.Options;

namespace EventStageTimer.Infrastructure.Storage;

public sealed class LocalFileStorage(IOptions<LocalFileStorageOptions> opts) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(opts.Value.Root);

    public async Task<string> SaveAsync(Stream content, string contentType, CancellationToken ct)
    {
        Directory.CreateDirectory(_root);
        var key = $"{Guid.NewGuid():N}{ExtFor(contentType)}";
        var path = Path.Combine(_root, key);
        await using var fs = File.Create(path);
        await content.CopyToAsync(fs, ct);
        await File.WriteAllTextAsync(path + ".type", contentType, ct);
        return key;
    }

    public async Task<(Stream Content, string ContentType)?> OpenAsync(string key, CancellationToken ct)
    {
        var path = Path.Combine(_root, key);
        if (!File.Exists(path)) return null;
        var contentType = File.Exists(path + ".type") ? await File.ReadAllTextAsync(path + ".type", ct) : "application/octet-stream";
        return (File.OpenRead(path), contentType);
    }

    public Task DeleteAsync(string key, CancellationToken ct)
    {
        var path = Path.Combine(_root, key);
        if (File.Exists(path)) File.Delete(path);
        if (File.Exists(path + ".type")) File.Delete(path + ".type");
        return Task.CompletedTask;
    }

    private static string ExtFor(string ct) => ct switch
    {
        "image/png" => ".png",
        "image/svg+xml" => ".svg",
        "image/jpeg" => ".jpg",
        _ => "",
    };
}
```

Wire in Program.cs after Email block:

```csharp
builder.Services.Configure<EventStageTimer.Infrastructure.Storage.LocalFileStorageOptions>(builder.Configuration.GetSection("Storage:Local"));
builder.Services.AddSingleton<EventStageTimer.Infrastructure.Storage.IFileStorage, EventStageTimer.Infrastructure.Storage.LocalFileStorage>();
```

Add to appsettings.json:

```json
"Storage": { "Local": { "Root": "./uploads" } }
```

---

## Task 2: `BrandingController` + `PublicBrandingController`

Authenticated controller for editing theme/logo; public controller exposing merged theme + logo URL.

```csharp
// src/EventStageTimer.Api/Controllers/BrandingController.cs
using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/branding")]
public sealed class BrandingController(AppDbContext db, IClock clock, IFileStorage files) : ControllerBase
{
    public sealed record BrandingDto(string ThemeJson, string DefaultThresholdsJson, string? LogoUrl);
    public sealed record UpdateThemeBody(string ThemeJson, string DefaultThresholdsJson);

    [HttpGet]
    public async Task<ActionResult<BrandingDto>> Get(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var logoUrl = ev.LogoBlobKey is null ? null : $"/api/events/{eventId}/branding/logo";
        return Ok(new BrandingDto(ev.ThemeJson, ev.DefaultThresholdsJson, logoUrl));
    }

    [HttpPut]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, [FromBody] UpdateThemeBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.ThemeJson = string.IsNullOrWhiteSpace(body.ThemeJson) ? "{}" : body.ThemeJson;
        ev.DefaultThresholdsJson = string.IsNullOrWhiteSpace(body.DefaultThresholdsJson) ? "[]" : body.DefaultThresholdsJson;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("logo")]
    [Authorize(Policy = "EventAdmin")]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(Guid eventId, IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { error = "No file" });
        if (file.Length > 2 * 1024 * 1024) return BadRequest(new { error = "Max 2MB" });
        var ct2 = file.ContentType?.ToLowerInvariant() ?? "";
        if (ct2 != "image/png" && ct2 != "image/svg+xml" && ct2 != "image/jpeg")
            return BadRequest(new { error = "PNG, SVG, or JPEG only" });

        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();

        if (ev.LogoBlobKey is { } oldKey) await files.DeleteAsync(oldKey, ct);

        await using var s = file.OpenReadStream();
        var key = await files.SaveAsync(s, ct2, ct);
        ev.LogoBlobKey = key;
        await db.SaveChangesAsync(ct);

        _ = clock; // suppress unused warning if needed
        return Ok(new { logoUrl = $"/api/events/{eventId}/branding/logo" });
    }

    [HttpGet("logo")]
    [AllowAnonymous] // accessible to anyone with a valid event id (low-risk asset)
    public async Task<IActionResult> GetLogo(Guid eventId, CancellationToken ct)
    {
        var key = await db.Events.IgnoreQueryFilters().Where(e => e.Id == eventId).Select(e => e.LogoBlobKey).FirstOrDefaultAsync(ct);
        if (key is null) return NotFound();
        var f = await files.OpenAsync(key, ct);
        if (f is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=300";
        return File(f.Value.Content, f.Value.ContentType);
    }

    [HttpDelete("logo")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> RemoveLogo(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        if (ev.LogoBlobKey is { } k) { await files.DeleteAsync(k, ct); ev.LogoBlobKey = null; }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

```csharp
// src/EventStageTimer.Api/Controllers/PublicBrandingController.cs
using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
public sealed class PublicBrandingController(PublicAccessContext ctx, AppDbContext db) : ControllerBase
{
    public sealed record BrandingDto(string ThemeJson, string DefaultThresholdsJson, string? LogoUrl, string EventName);

    [HttpGet("/r/{code}/branding")]
    [HttpGet("/e/{code}/branding")]
    public async Task<ActionResult<BrandingDto>> Get(string code, CancellationToken ct)
    {
        if (ctx.EventId is not { } eid) return NotFound();
        var ev = await db.Events.IgnoreQueryFilters()
            .Where(e => e.Id == eid)
            .Select(e => new { e.Name, e.ThemeJson, e.DefaultThresholdsJson, e.LogoBlobKey })
            .FirstOrDefaultAsync(ct);
        if (ev is null) return NotFound();
        var logoUrl = ev.LogoBlobKey is null ? null : $"/api/events/{eid}/branding/logo";
        return Ok(new BrandingDto(ev.ThemeJson, ev.DefaultThresholdsJson, logoUrl, ev.Name));
    }
}
```

---

## Task 3: `MembersController` + `InvitationsController`

```csharp
// src/EventStageTimer.Api/Controllers/MembersController.cs
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/members")]
public sealed class MembersController(AppDbContext db) : ControllerBase
{
    public sealed record MemberDto(Guid Id, Guid UserId, string Email, string? DisplayName, EventRole Role, IReadOnlyList<Guid> ScopedRoomIds);
    public sealed record UpdateRoleBody(EventRole Role, IReadOnlyList<Guid>? ScopedRoomIds);

    [HttpGet]
    public async Task<IReadOnlyList<MemberDto>> List(Guid eventId, CancellationToken ct)
    {
        var rows = await db.EventMemberships
            .Where(m => m.EventId == eventId)
            .Select(m => new
            {
                m.Id, m.UserId, m.Role,
                Email = m.User.Email!,
                DisplayName = m.User.DisplayName,
                ScopedRoomIds = m.ScopedRooms.Select(s => s.RoomId).ToList(),
            }).ToListAsync(ct);
        return rows.Select(r => new MemberDto(r.Id, r.UserId, r.Email, r.DisplayName, r.Role, r.ScopedRoomIds)).ToList();
    }

    [HttpPut("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> UpdateRole(Guid eventId, Guid membershipId, [FromBody] UpdateRoleBody body, CancellationToken ct)
    {
        var m = await db.EventMemberships
            .Include(x => x.ScopedRooms)
            .FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();
        m.Role = body.Role;
        m.ScopedRooms.Clear();
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { } ids)
        {
            foreach (var rid in ids)
                m.ScopedRooms.Add(new EventMembershipRoom { EventMembershipId = m.Id, RoomId = rid });
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{membershipId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Remove(Guid eventId, Guid membershipId, CancellationToken ct)
    {
        var m = await db.EventMemberships.FirstOrDefaultAsync(x => x.Id == membershipId && x.EventId == eventId, ct);
        if (m is null) return NotFound();
        db.EventMemberships.Remove(m);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

```csharp
// src/EventStageTimer.Api/Controllers/InvitationsController.cs
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class InvitationsController(
    AppDbContext db,
    IClock clock,
    IEmailSender email,
    IConfiguration config,
    UserManager<User> users) : ControllerBase
{
    public sealed record InvitationDto(Guid Id, string Email, EventRole Role, IReadOnlyList<Guid> ScopedRoomIds, DateTime ExpiresAt, DateTime? AcceptedAt, bool EmailSendFailed, string AcceptUrl);
    public sealed record CreateBody(string Email, EventRole Role, IReadOnlyList<Guid>? ScopedRoomIds);
    public sealed record AcceptInfo(string EventName, EventRole Role);

    [HttpGet("events/{eventId:guid}/invitations")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IReadOnlyList<InvitationDto>> List(Guid eventId, CancellationToken ct)
    {
        var rows = await db.Invitations
            .Where(i => i.EventId == eventId && i.AcceptedAt == null)
            .Select(i => new
            {
                i.Id, i.Email, i.Role, i.Token, i.ExpiresAt, i.AcceptedAt, i.EmailSendFailed,
                ScopedRoomIds = i.ScopedRooms.Select(s => s.RoomId).ToList(),
            }).ToListAsync(ct);
        var baseUrl = config["App:BaseUrl"] ?? "";
        return rows.Select(r => new InvitationDto(r.Id, r.Email, r.Role, r.ScopedRoomIds, r.ExpiresAt, r.AcceptedAt, r.EmailSendFailed, $"{baseUrl}/invitations/{r.Token}")).ToList();
    }

    [HttpPost("events/{eventId:guid}/invitations")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<InvitationDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        var inv = new Invitation
        {
            Id = Guid.NewGuid(), TenantId = ev.TenantId, EventId = eventId,
            Email = body.Email.ToLowerInvariant(), Role = body.Role,
            Token = token, ExpiresAt = clock.UtcNow.AddDays(7), CreatedAtUtc = clock.UtcNow,
        };
        db.Invitations.Add(inv);
        if (body.Role == EventRole.RoomOperator && body.ScopedRoomIds is { } ids)
        {
            foreach (var rid in ids)
                db.InvitationRooms.Add(new InvitationRoom { InvitationId = inv.Id, RoomId = rid });
        }

        var baseUrl = config["App:BaseUrl"] ?? "";
        var link = $"{baseUrl}/invitations/{token}";
        try
        {
            await email.SendAsync(new EmailMessage(
                inv.Email,
                $"You're invited to {ev.Name}",
                $"<p>You've been invited to join <b>{ev.Name}</b> as <b>{body.Role}</b>.</p><p>Accept: <a href=\"{link}\">{link}</a></p><p>This link expires in 7 days.</p>",
                $"You've been invited to join {ev.Name} as {body.Role}.\nAccept: {link}\nExpires in 7 days."), ct);
        }
        catch (EmailSendException) { inv.EmailSendFailed = true; }

        await db.SaveChangesAsync(ct);
        return Ok(new InvitationDto(inv.Id, inv.Email, inv.Role, body.ScopedRoomIds ?? Array.Empty<Guid>(), inv.ExpiresAt, null, inv.EmailSendFailed, link));
    }

    [HttpDelete("events/{eventId:guid}/invitations/{invitationId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Revoke(Guid eventId, Guid invitationId, CancellationToken ct)
    {
        var inv = await db.Invitations.FirstOrDefaultAsync(i => i.Id == invitationId && i.EventId == eventId, ct);
        if (inv is null) return NotFound();
        db.Invitations.Remove(inv);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("invitations/{token}/info")]
    [AllowAnonymous]
    public async Task<ActionResult<AcceptInfo>> GetInfo(string token, CancellationToken ct)
    {
        var inv = await db.Invitations.IgnoreQueryFilters()
            .Where(i => i.Token == token)
            .Select(i => new { i.Email, i.Role, i.ExpiresAt, i.AcceptedAt, EventName = i.Event.Name })
            .FirstOrDefaultAsync(ct);
        if (inv is null) return NotFound();
        if (inv.AcceptedAt is not null) return Conflict(new { error = "AlreadyAccepted" });
        if (inv.ExpiresAt < clock.UtcNow) return Gone();
        return Ok(new AcceptInfo(inv.EventName, inv.Role));
    }

    [HttpPost("invitations/{token}/accept")]
    [Authorize] // signed-in user
    public async Task<IActionResult> Accept(string token, CancellationToken ct)
    {
        var inv = await db.Invitations.IgnoreQueryFilters()
            .Include(i => i.ScopedRooms)
            .FirstOrDefaultAsync(i => i.Token == token, ct);
        if (inv is null) return NotFound();
        if (inv.AcceptedAt is not null) return Conflict(new { error = "AlreadyAccepted" });
        if (inv.ExpiresAt < clock.UtcNow) return Gone();

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await users.FindByIdAsync(userId.ToString());
        if (user?.Email is null || !string.Equals(user.Email, inv.Email, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var membership = new EventMembership
        {
            Id = Guid.NewGuid(), TenantId = inv.TenantId, EventId = inv.EventId,
            UserId = userId, Role = inv.Role, CreatedAtUtc = clock.UtcNow,
        };
        db.EventMemberships.Add(membership);
        if (inv.Role == EventRole.RoomOperator)
        {
            foreach (var sr in inv.ScopedRooms)
                db.EventMembershipRooms.Add(new EventMembershipRoom { EventMembershipId = membership.Id, RoomId = sr.RoomId });
        }
        inv.AcceptedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { eventId = inv.EventId });
    }

    private static IActionResult Gone() => new ObjectResult(new { error = "Expired" }) { StatusCode = 410 };
}
```

Wire up `db.InvitationRooms` DbSet in AppDbContext (already present).

---

## Task 4: `AuditController`

```csharp
// src/EventStageTimer.Api/Controllers/AuditController.cs
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/events/{eventId:guid}/audit")]
public sealed class AuditController(AppDbContext db) : ControllerBase
{
    public sealed record EntryDto(Guid Id, DateTime AtUtc, Guid? UserId, string? UserEmail, Guid? RoomId, string? RoomName, string Action, string DetailsJson);

    [HttpGet]
    public async Task<IReadOnlyList<EntryDto>> List(Guid eventId, [FromQuery] int take = 200, CancellationToken ct = default)
    {
        var rows = await db.AuditLog
            .Where(a => a.EventId == eventId || db.Rooms.Any(r => r.Id == a.RoomId && r.EventId == eventId))
            .OrderByDescending(a => a.AtUtc)
            .Take(Math.Clamp(take, 1, 1000))
            .Select(a => new
            {
                a.Id, a.AtUtc, a.UserId, a.RoomId, a.Action, a.DetailsJson,
                UserEmail = a.UserId == null ? null : db.Users.Where(u => u.Id == a.UserId).Select(u => u.Email).FirstOrDefault(),
                RoomName = a.RoomId == null ? null : db.Rooms.Where(r => r.Id == a.RoomId).Select(r => r.Name).FirstOrDefault(),
            }).ToListAsync(ct);
        return rows.Select(r => new EntryDto(r.Id, r.AtUtc, r.UserId, r.UserEmail, r.RoomId, r.RoomName, r.Action, r.DetailsJson)).ToList();
    }
}
```

---

## Task 5: Wire up Storage in Program.cs + appsettings

Already covered; add the services registration block.

---

## Task 6: Frontend — theme defaults + applyTheme + useBranding hook

```ts
// src/web/src/theme/defaults.ts
export const defaultTheme: Record<string, string> = {
  bg: "#0a0a0a",
  surface: "#161618",
  "text-primary": "#e8e8e8",
  "text-muted": "#aaaaaa",
  primary: "#2ecc71",
  accent: "#8ab4f8",
  warning: "#c9b380",
  danger: "#e67e22",
  final: "#f1c40f",
  overrun: "#e74c3c",
  "message-bg": "#c0392b",
  "message-text": "#ffffff",
};
```

```ts
// src/web/src/theme/applyTheme.ts
import { defaultTheme } from "./defaults";

export function mergeTheme(themeJson: string): Record<string, string> {
  let parsed: Record<string, string> = {};
  try {
    const raw = JSON.parse(themeJson);
    if (raw && typeof raw === "object") parsed = raw;
  } catch { /* ignore — use defaults */ }
  return { ...defaultTheme, ...parsed };
}

export function applyTheme(target: HTMLElement, tokens: Record<string, string>) {
  for (const [k, v] of Object.entries(tokens)) {
    target.style.setProperty(`--${k}`, v);
  }
}
```

```ts
// src/web/src/api/branding.ts
import { api } from "./client";

export interface PublicBrandingDto { themeJson: string; defaultThresholdsJson: string; logoUrl: string | null; eventName: string }
export interface BrandingDto { themeJson: string; defaultThresholdsJson: string; logoUrl: string | null }
export interface UpdateThemeBody { themeJson: string; defaultThresholdsJson: string }

export const branding = {
  getPublic: (code: string, scope: "r" | "e") => api<PublicBrandingDto>(`/${scope}/${code}/branding`),
  getEvent: (eventId: string) => api<BrandingDto>(`/api/events/${eventId}/branding`),
  updateEvent: (eventId: string, body: UpdateThemeBody) =>
    api<void>(`/api/events/${eventId}/branding`, { method: "PUT", body: JSON.stringify(body) }),
  removeLogo: (eventId: string) => api<void>(`/api/events/${eventId}/branding/logo`, { method: "DELETE" }),
};
```

```ts
// src/web/src/hooks/useBranding.ts
import { useEffect, useState } from "react";
import { branding } from "@/api/branding";
import { applyTheme, mergeTheme } from "@/theme/applyTheme";

export function useBranding(code: string | undefined, scope: "r" | "e") {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string>("");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    branding.getPublic(code, scope).then((info) => {
      if (cancelled) return;
      const tokens = mergeTheme(info.themeJson);
      applyTheme(document.documentElement, tokens);
      setLogoUrl(info.logoUrl);
      setEventName(info.eventName);
    }).catch(() => { /* fall back to defaults */ });
    return () => { cancelled = true; };
  }, [code, scope]);

  return { logoUrl, eventName };
}
```

Use in SpeakerView, DoorView, LobbyView — add `const { logoUrl } = useBranding(accessCode, "r");` (or "e" for lobby) at top, render logo when present.

---

## Task 7: BrandingPage (operator)

A simple form with color inputs and a logo upload.

```tsx
// src/web/src/pages/BrandingPage.tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { branding, type UpdateThemeBody } from "@/api/branding";
import { defaultTheme } from "@/theme/defaults";

const tokenList = Object.keys(defaultTheme);

export default function BrandingPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const get = useQuery({ queryKey: ["branding", eventId], queryFn: () => branding.getEvent(eventId!), enabled: !!eventId });

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [thresholdsJson, setThresholdsJson] = useState<string>("[]");
  const [error, setError] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);

  useEffect(() => {
    if (!get.data) return;
    try { setOverrides(JSON.parse(get.data.themeJson) as Record<string, string>); } catch { setOverrides({}); }
    setThresholdsJson(get.data.defaultThresholdsJson);
  }, [get.data]);

  const save = useMutation({
    mutationFn: (body: UpdateThemeBody) => branding.updateEvent(eventId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branding", eventId] }),
  });

  async function uploadLogo(file: File) {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const resp = await fetch(`/api/events/${eventId}/branding/logo`, { method: "POST", body: form, credentials: "include" });
    if (!resp.ok) { setError(`Upload failed (${resp.status})`); return; }
    setLogoVersion((n) => n + 1);
    qc.invalidateQueries({ queryKey: ["branding", eventId] });
  }

  const removeLogo = useMutation({
    mutationFn: () => branding.removeLogo(eventId!),
    onSuccess: () => { setLogoVersion((n) => n + 1); qc.invalidateQueries({ queryKey: ["branding", eventId] }); },
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (get.isLoading) return <div className="p-8">Loading…</div>;
  if (get.error) return <div className="p-8 text-red-400">Failed to load branding.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Branding</h1>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Logo</h2>
        {get.data!.logoUrl && (
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
            <img src={`${get.data!.logoUrl}?v=${logoVersion}`} alt="logo" className="max-h-24" />
          </div>
        )}
        <div className="flex gap-2 items-center">
          <input type="file" accept="image/png,image/svg+xml,image/jpeg"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
          {get.data!.logoUrl && (
            <button onClick={() => removeLogo.mutate()} className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Remove</button>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Theme tokens</h2>
        <p className="text-xs text-zinc-500">Override only the tokens you want changed; the rest fall back to defaults.</p>
        <ul className="grid grid-cols-2 gap-2">
          {tokenList.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <label className="flex-1 text-sm">{k}</label>
              <input type="color" value={overrides[k] ?? defaultTheme[k]}
                onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value })}
                className="w-12 h-8" />
              <input type="text" value={overrides[k] ?? ""}
                onChange={(e) => setOverrides({ ...overrides, [k]: e.target.value })}
                placeholder={defaultTheme[k]}
                className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono" />
              {overrides[k] && (
                <button onClick={() => { const c = { ...overrides }; delete c[k]; setOverrides(c); }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs">×</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Default thresholds (JSON)</h2>
        <p className="text-xs text-zinc-500">Schedule items inherit these unless they define their own.</p>
        <textarea value={thresholdsJson} onChange={(e) => setThresholdsJson(e.target.value)}
          rows={6} className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 font-mono text-xs" />
      </section>

      <div className="flex gap-2">
        <button
          onClick={() => save.mutate({ themeJson: JSON.stringify(overrides), defaultThresholdsJson: thresholdsJson })}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isSuccess && <span className="text-sm text-green-400 self-center">Saved</span>}
      </div>
    </div>
  );
}
```

---

## Task 8: MembersPage + InvitationsPage (combined)

```tsx
// src/web/src/api/members.ts
import { api } from "./client";

export type EventRole = "EventAdmin" | "RoomOperator" | "Viewer";
export const roleValue = { EventAdmin: 1, RoomOperator: 2, Viewer: 3 } as const;

export interface MemberDto { id: string; userId: string; email: string; displayName: string | null; role: EventRole; scopedRoomIds: string[] }
export interface UpdateRoleBody { role: number; scopedRoomIds: string[] | null }

export const members = {
  list: (eventId: string) => api<MemberDto[]>(`/api/events/${eventId}/members`),
  updateRole: (eventId: string, membershipId: string, body: UpdateRoleBody) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (eventId: string, membershipId: string) =>
    api<void>(`/api/events/${eventId}/members/${membershipId}`, { method: "DELETE" }),
};
```

```ts
// src/web/src/api/invitations.ts
import { api } from "./client";

export interface InvitationDto {
  id: string; email: string; role: string; scopedRoomIds: string[];
  expiresAt: string; acceptedAt: string | null; emailSendFailed: boolean; acceptUrl: string;
}

export const invitations = {
  list: (eventId: string) => api<InvitationDto[]>(`/api/events/${eventId}/invitations`),
  create: (eventId: string, body: { email: string; role: number; scopedRoomIds?: string[] }) =>
    api<InvitationDto>(`/api/events/${eventId}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  revoke: (eventId: string, invitationId: string) =>
    api<void>(`/api/events/${eventId}/invitations/${invitationId}`, { method: "DELETE" }),
  info: (token: string) => api<{ eventName: string; role: string }>(`/api/invitations/${token}/info`),
  accept: (token: string) => api<{ eventId: string }>(`/api/invitations/${token}/accept`, { method: "POST" }),
};
```

```tsx
// src/web/src/pages/MembersPage.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { members } from "@/api/members";
import { invitations } from "@/api/invitations";
import { Trash2, Copy } from "lucide-react";

const roleNumeric: Record<string, number> = { EventAdmin: 1, RoomOperator: 2, Viewer: 3 };

export default function MembersPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const memberQuery = useQuery({ queryKey: ["members", eventId], queryFn: () => members.list(eventId!), enabled: !!eventId });
  const inviteQuery = useQuery({ queryKey: ["invitations", eventId], queryFn: () => invitations.list(eventId!), enabled: !!eventId });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"EventAdmin" | "RoomOperator" | "Viewer">("Viewer");

  const create = useMutation({
    mutationFn: () => invitations.create(eventId!, { email, role: roleNumeric[role] }),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["invitations", eventId] }); },
  });
  const removeMember = useMutation({
    mutationFn: (id: string) => members.remove(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", eventId] }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => invitations.revoke(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invitations", eventId] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: number }) => members.updateRole(eventId!, id, { role, scopedRoomIds: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", eventId] }),
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Members & invitations</h1>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-zinc-500">Invite</h2>
        <div className="flex gap-2 items-center">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com"
            className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
          <select value={role} onChange={(e) => setRole(e.target.value as "EventAdmin" | "RoomOperator" | "Viewer")}
            className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800">
            <option value="EventAdmin">Event Admin</option>
            <option value="RoomOperator">Room Operator</option>
            <option value="Viewer">Viewer</option>
          </select>
          <button disabled={!email.trim()} onClick={() => create.mutate()}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">Invite</button>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Pending invitations</h2>
        <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {inviteQuery.data?.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 p-3">
              <div className="flex-1">
                <div className="text-sm">{inv.email} <span className="text-zinc-500">· {inv.role}</span></div>
                <div className="text-xs text-zinc-500">Expires {new Date(inv.expiresAt).toLocaleString()}</div>
              </div>
              {inv.emailSendFailed && <span className="text-xs text-orange-400">Email failed</span>}
              <button onClick={() => navigator.clipboard.writeText(inv.acceptUrl)}
                className="text-zinc-500 hover:text-zinc-300" title="Copy accept link">
                <Copy className="size-4" />
              </button>
              <button onClick={() => { if (confirm(`Revoke invitation to ${inv.email}?`)) revoke.mutate(inv.id); }}
                className="text-zinc-500 hover:text-red-400">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {inviteQuery.data?.length === 0 && <li className="p-3 text-sm text-zinc-500">No pending invitations.</li>}
        </ul>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-zinc-500 mb-2">Members</h2>
        <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {memberQuery.data?.map((m) => (
            <li key={m.id} className="flex items-center gap-2 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{m.email}</div>
                {m.displayName && <div className="text-xs text-zinc-500">{m.displayName}</div>}
              </div>
              <select value={m.role}
                onChange={(e) => updateRole.mutate({ id: m.id, role: roleNumeric[e.target.value] })}
                className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm">
                <option value="EventAdmin">EventAdmin</option>
                <option value="RoomOperator">RoomOperator</option>
                <option value="Viewer">Viewer</option>
              </select>
              <button onClick={() => { if (confirm(`Remove ${m.email}?`)) removeMember.mutate(m.id); }}
                className="text-zinc-500 hover:text-red-400">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

---

## Task 9: AuditPage

```ts
// src/web/src/api/audit.ts
import { api } from "./client";

export interface AuditEntryDto {
  id: string; atUtc: string;
  userId: string | null; userEmail: string | null;
  roomId: string | null; roomName: string | null;
  action: string; detailsJson: string;
}

export const audit = {
  list: (eventId: string, take = 200) => api<AuditEntryDto[]>(`/api/events/${eventId}/audit?take=${take}`),
};
```

```tsx
// src/web/src/pages/AuditPage.tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { audit } from "@/api/audit";
import { useState } from "react";

export default function AuditPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const list = useQuery({ queryKey: ["audit", eventId], queryFn: () => audit.list(eventId!), enabled: !!eventId });
  const [filter, setFilter] = useState("");

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  const rows = (list.data ?? []).filter((r) =>
    !filter ||
    r.action.toLowerCase().includes(filter.toLowerCase()) ||
    (r.userEmail ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    (r.roomName ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <input
        value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by action / user / room"
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 text-sm" />
      <ul className="rounded border border-zinc-800 divide-y divide-zinc-800 font-mono text-xs">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[140px_120px_140px_1fr_2fr] gap-3 p-2">
            <span className="text-zinc-500">{new Date(r.atUtc).toLocaleString()}</span>
            <span className="text-blue-400">{r.action}</span>
            <span className="text-zinc-400">{r.userEmail ?? "system"}</span>
            <span className="text-zinc-400">{r.roomName ?? "—"}</span>
            <span className="text-zinc-500 truncate" title={r.detailsJson}>{r.detailsJson}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-sm text-zinc-500">No entries.</li>}
      </ul>
    </div>
  );
}
```

---

## Task 10: InvitationAcceptPage

Public-but-authenticated page at `/invitations/{token}` that calls info → accept.

```tsx
// src/web/src/pages/InvitationAcceptPage.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { invitations } from "@/api/invitations";
import { ApiError } from "@/api/client";

export default function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();
  const info = useQuery({ queryKey: ["inviteInfo", token], queryFn: () => invitations.info(token!), enabled: !!token, retry: false });
  const accept = useMutation({
    mutationFn: () => invitations.accept(token!),
    onSuccess: (r) => nav(`/events/${r.eventId}`),
  });

  if (!token) return <div className="p-8 text-red-400">Missing token.</div>;
  if (info.isLoading) return <div className="p-8">Loading…</div>;
  if (info.error) {
    const err = info.error as ApiError;
    if (err.status === 401) return <div className="p-8">You need to <a href={`/signin?next=/invitations/${token}`} className="text-blue-400 hover:underline">sign in</a> with the invited email first.</div>;
    if (err.status === 410) return <div className="p-8 text-red-400">This invitation has expired.</div>;
    if (err.status === 409) return <div className="p-8 text-zinc-400">This invitation has already been accepted.</div>;
    return <div className="p-8 text-red-400">Could not load invitation.</div>;
  }

  return (
    <div className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Accept invitation</h1>
      <p>You've been invited to <strong>{info.data!.eventName}</strong> as <strong>{info.data!.role}</strong>.</p>
      {accept.error && <p className="text-red-400">Acceptance failed. The signed-in account may not match the invited email.</p>}
      <button
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">
        {accept.isPending ? "Accepting…" : "Accept invitation"}
      </button>
    </div>
  );
}
```

---

## Task 11: Wire all routes + dashboard links

`routes.tsx` adds:

```tsx
{ path: "/events/:eventId/branding", element: <ProtectedRoute><BrandingPage /></ProtectedRoute> },
{ path: "/events/:eventId/members", element: <ProtectedRoute><MembersPage /></ProtectedRoute> },
{ path: "/events/:eventId/audit", element: <ProtectedRoute><AuditPage /></ProtectedRoute> },
{ path: "/invitations/:token", element: <ProtectedRoute><InvitationAcceptPage /></ProtectedRoute> },
```

Dashboard links bar gets Branding / Members / Audit links.

Speaker / Door / Lobby views call `useBranding(accessCode, "r" or "e")` and render `<img src={logoUrl}>` when present.

---

## Task 12: Smoke + commit

```bash
dotnet test                    # all backend green
(cd src/web && npm test -- --run && npm run build)
```
