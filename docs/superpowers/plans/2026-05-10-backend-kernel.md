# Backend Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete server-side foundation for the Event Stage Timer — solution scaffolding, EF Core schema, ASP.NET Core Identity (both magic-link and password auth modes), multi-tenant query scoping, the timer state machine, the SignalR `TimerHub`, the auto-start scheduler, public access codes with rate limiting, and a comprehensive integration test suite that proves the live-timing loop end-to-end without any UI.

**Architecture:** Three .NET 10 projects in one solution. `EventStageTimer.Domain` holds entities, the timer state machine, and command types — no infrastructure dependencies. `EventStageTimer.Infrastructure` holds the EF Core `DbContext`, email senders, and file storage abstractions. `EventStageTimer.Api` is the ASP.NET Core 10 host with controllers, SignalR hub, auth, middleware, and the scheduler `BackgroundService`. Two test projects: `Domain.Tests` (pure unit) and `Api.Tests` (integration via `WebApplicationFactory` and Testcontainers SQL Server).

**Tech Stack:** .NET 10, ASP.NET Core 10, SignalR, Entity Framework Core 10, ASP.NET Core Identity (`IdentityCore`), Microsoft.Data.SqlClient, xUnit, FluentAssertions, Testcontainers.MsSql, Microsoft.AspNetCore.Mvc.Testing, Microsoft.AspNetCore.SignalR.Client.

**Spec reference:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md` — anchors are referenced in each task.

---

## File structure

```
src/
  EventStageTimer.Domain/                       # No infrastructure deps
    EventStageTimer.Domain.csproj
    Common/
      IClock.cs                                 # T2
      SystemClock.cs                            # T2
      AccessCode.cs                             # T2 (alphabet, format/parse)
      Result.cs                                 # T2 (Result<T> + error codes)
    Entities/
      Tenant.cs                                 # T3
      User.cs                                   # T3 (extends IdentityUser<Guid>)
      TenantMembership.cs                       # T3
      Event.cs                                  # T4
      EventMembership.cs                        # T4
      EventMembershipRoom.cs                    # T4
      Invitation.cs                             # T5
      InvitationRoom.cs                         # T5
      Room.cs                                   # T6
      ScheduleItem.cs                           # T6
      ScheduleItemRun.cs                        # T7
      RoomTimerState.cs                         # T7
      TimerPhase.cs                             # T7 (enum)
      MessageTemplate.cs                        # T8
      AuditLogEntry.cs                          # T8
      AuthMagicLink.cs                          # T8
      EmailOutbox.cs                            # T8
    Timer/
      TimerStateMachine.cs                      # T12
      Snapshot.cs                               # T13 (server-side DTO)
      Commands/
        StartItemCommand.cs                     # T14
        PauseCommand.cs                         # T15
        ResumeCommand.cs                        # T15
        StopCommand.cs                          # T16
        ResetCommand.cs                         # T16
        SkipNextCommand.cs                      # T17
        AdjustTimeCommand.cs                    # T18
        SetExactRemainingCommand.cs             # T18
        SetMessageCommand.cs                    # T19
        ClearMessageCommand.cs                  # T19
      TimerCommandError.cs                      # T14

  EventStageTimer.Infrastructure/
    EventStageTimer.Infrastructure.csproj
    Persistence/
      AppDbContext.cs                           # T9
      Migrations/                               # T10 (generated)
      ModelConfiguration/
        TenancyQueryFilters.cs                  # T9
    Tenancy/
      ITenantContext.cs                         # T11
      TenantContext.cs                          # T11
    Timer/
      TimerCommandService.cs                    # T20 (executes commands against DB)
    Email/
      IEmailSender.cs                           # T21
      NoOpEmailSender.cs                        # T21
      SmtpEmailSender.cs                        # T22
      SmtpOptions.cs                            # T22
    Auth/
      AccessCodeGenerator.cs                    # T23

  EventStageTimer.Api/
    EventStageTimer.Api.csproj
    Program.cs                                  # T1, extended through plan
    appsettings.json                            # T1
    appsettings.Development.json                # T1
    Auth/
      Identity/
        IdentitySetup.cs                        # T24
      MagicLink/
        MagicLinkService.cs                     # T25
        MagicLinkController.cs                  # T26
      Password/
        PasswordController.cs                   # T27
      Bootstrap/
        BootstrapController.cs                  # T28
      Policies/
        EventAccessRequirement.cs               # T29
        EventAccessHandler.cs                   # T29
        RoomAccessRequirement.cs                # T30
        RoomAccessHandler.cs                    # T30
      Public/
        PublicAccessCodeAuthHandler.cs          # T31
        PublicAccessCodeAuthOptions.cs          # T31
        PublicAccessContext.cs                  # T31
    Middleware/
      PublicRateLimitMiddleware.cs              # T32
      TenantResolutionMiddleware.cs             # T11
    Controllers/
      EventsController.cs                       # T33
      RoomsController.cs                        # T34
      ScheduleItemsController.cs                # T35
    Hubs/
      TimerHub.cs                               # T36, T38, T39, T40
      TimerHubAuthFilter.cs                     # T36
    BackgroundServices/
      SchedulerService.cs                       # T41
    Audit/
      AuditWriter.cs                            # T42

tests/
  EventStageTimer.Domain.Tests/
    EventStageTimer.Domain.Tests.csproj
    Common/
      AccessCodeTests.cs                        # T43
    Timer/
      TimerStateMachineTests.cs                 # T44
      ThresholdSelectionTests.cs                # T45
  EventStageTimer.Api.Tests/
    EventStageTimer.Api.Tests.csproj
    Fixtures/
      SqlServerFixture.cs                       # T46
      TestApiFactory.cs                         # T46
      TestClock.cs                              # T47
      AuthHelpers.cs                            # T47
    Hubs/
      FullSessionTests.cs                       # T48
      StaleVersionTests.cs                      # T49
      MessageVersioningTests.cs                 # T50
      SkipNextAtomicityTests.cs                 # T51
    Background/
      SchedulerServiceTests.cs                  # T52
    Public/
      RateLimitTests.cs                         # T53
      AccessCodeLookupTests.cs                  # T53
    Auth/
      MagicLinkAuthTests.cs                     # T54
      PasswordAuthTests.cs                      # T54
      PolicyTests.cs                            # T55
    Tenancy/
      TenantIsolationTests.cs                   # T56
    Seed/
      SeedDataTests.cs                          # T57

EventStageTimer.sln                             # T1
global.json                                     # T1
.editorconfig                                   # T1
Directory.Packages.props                        # T1 (central package versions)
```

---

## Task 1: Solution scaffolding

**Files:**
- Create: `EventStageTimer.sln`
- Create: `global.json`
- Create: `Directory.Packages.props`
- Create: `.editorconfig`
- Create: `src/EventStageTimer.Domain/EventStageTimer.Domain.csproj`
- Create: `src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj`
- Create: `src/EventStageTimer.Api/EventStageTimer.Api.csproj`
- Create: `src/EventStageTimer.Api/Program.cs`
- Create: `src/EventStageTimer.Api/appsettings.json`
- Create: `src/EventStageTimer.Api/appsettings.Development.json`
- Create: `tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj`
- Create: `tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj`

- [ ] **Step 1: Pin SDK and create solution + projects**

```bash
cat > global.json <<'EOF'
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
EOF

dotnet new sln -n EventStageTimer

dotnet new classlib -n EventStageTimer.Domain          -o src/EventStageTimer.Domain          -f net10.0
dotnet new classlib -n EventStageTimer.Infrastructure  -o src/EventStageTimer.Infrastructure  -f net10.0
dotnet new web      -n EventStageTimer.Api             -o src/EventStageTimer.Api             -f net10.0
dotnet new xunit    -n EventStageTimer.Domain.Tests    -o tests/EventStageTimer.Domain.Tests  -f net10.0
dotnet new xunit    -n EventStageTimer.Api.Tests       -o tests/EventStageTimer.Api.Tests     -f net10.0

# Remove the placeholder Class1.cs files
rm -f src/EventStageTimer.Domain/Class1.cs src/EventStageTimer.Infrastructure/Class1.cs

dotnet sln add src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
dotnet sln add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj
dotnet sln add src/EventStageTimer.Api/EventStageTimer.Api.csproj
dotnet sln add tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj
dotnet sln add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj
```

Expected: 5 projects added to `EventStageTimer.sln`.

- [ ] **Step 2: Wire project references**

```bash
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj reference src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
dotnet add src/EventStageTimer.Api/EventStageTimer.Api.csproj reference src/EventStageTimer.Domain/EventStageTimer.Domain.csproj src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj
dotnet add tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj reference src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
dotnet add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj reference src/EventStageTimer.Api/EventStageTimer.Api.csproj src/EventStageTimer.Domain/EventStageTimer.Domain.csproj src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj
```

- [ ] **Step 3: Create central package versions file**

Create `Directory.Packages.props`:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
    <CentralPackageTransitivePinningEnabled>true</CentralPackageTransitivePinningEnabled>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.EntityFrameworkCore" Version="10.0.0" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.SqlServer" Version="10.0.0" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.0" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Relational" Version="10.0.0" />
    <PackageVersion Include="Microsoft.AspNetCore.Identity.EntityFrameworkCore" Version="10.0.0" />
    <PackageVersion Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.0.0" />
    <PackageVersion Include="Microsoft.AspNetCore.SignalR.Client" Version="10.0.0" />
    <PackageVersion Include="Microsoft.AspNetCore.Mvc.Testing" Version="10.0.0" />
    <PackageVersion Include="MailKit" Version="4.8.0" />
    <PackageVersion Include="Azure.Storage.Blobs" Version="12.22.0" />
    <PackageVersion Include="QRCoder" Version="1.6.0" />
    <PackageVersion Include="xunit" Version="2.9.2" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="17.11.1" />
    <PackageVersion Include="FluentAssertions" Version="6.12.2" />
    <PackageVersion Include="Testcontainers.MsSql" Version="3.10.0" />
    <PackageVersion Include="Microsoft.AspNetCore.OpenApi" Version="10.0.0" />
  </ItemGroup>
</Project>
```

> If `dotnet restore` reports a 10.0.0 package version doesn't exist on NuGet at execution time, bump that single version to the latest released `10.0.*` shown by `dotnet package search`. Keep the central pinning model.

- [ ] **Step 4: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 4
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{json,yml,yaml,md}]
indent_size = 2

[*.cs]
csharp_new_line_before_open_brace = all
csharp_style_namespace_declarations = file_scoped:warning
dotnet_style_qualification_for_field = false:warning
dotnet_style_qualification_for_method = false:warning
csharp_using_directive_placement = outside_namespace:warning
```

- [ ] **Step 5: Replace the `dotnet new web` Program.cs with a placeholder we can grow**

Overwrite `src/EventStageTimer.Api/Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

var app = builder.Build();

app.MapControllers();
app.MapOpenApi();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

// Make the implicit Program class visible to the test project
public partial class Program { }
```

Add the OpenAPI package to the API csproj:

```bash
dotnet add src/EventStageTimer.Api/EventStageTimer.Api.csproj package Microsoft.AspNetCore.OpenApi
```

- [ ] **Step 6: Verify it all builds and the placeholder health endpoint runs**

```bash
dotnet build EventStageTimer.sln
```

Expected: `Build succeeded.` for all 5 projects.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: scaffold solution with Domain, Infrastructure, Api, and test projects"
```

---

## Task 2: Domain primitives — `IClock`, `AccessCode`, `Result`

**Files:**
- Create: `src/EventStageTimer.Domain/Common/IClock.cs`
- Create: `src/EventStageTimer.Domain/Common/SystemClock.cs`
- Create: `src/EventStageTimer.Domain/Common/AccessCode.cs`
- Create: `src/EventStageTimer.Domain/Common/Result.cs`
- Test: `tests/EventStageTimer.Domain.Tests/Common/AccessCodeTests.cs`

Spec anchors: §11 (access codes), §13 (clock skew + DST tests use `IClock`).

- [ ] **Step 1: Write failing test for `AccessCode.TryParse` accepting both `XXXXXXXX` and `XXXX-XXXX`**

Create `tests/EventStageTimer.Domain.Tests/Common/AccessCodeTests.cs`:

```csharp
using EventStageTimer.Domain.Common;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Common;

public class AccessCodeTests
{
    [Theory]
    [InlineData("ABCD2345", "ABCD2345")]
    [InlineData("abcd2345", "ABCD2345")]
    [InlineData("ABCD-2345", "ABCD2345")]
    [InlineData("abcd-2345", "ABCD2345")]
    public void TryParse_accepts_both_dashed_and_undashed_normalised_to_uppercase(string input, string expectedNormalised)
    {
        AccessCode.TryParse(input, out var code).Should().BeTrue();
        code.Value.Should().Be(expectedNormalised);
    }

    [Theory]
    [InlineData("ABCD234")]      // 7 chars
    [InlineData("ABCD23456")]    // 9 chars
    [InlineData("ABCD2I45")]     // 'I' excluded
    [InlineData("ABCD2O45")]     // 'O' excluded
    [InlineData("ABCD2045")]     // '0' excluded
    [InlineData("ABCD2145")]     // '1' excluded
    [InlineData("ABCD-23-45")]   // wrong dash placement
    public void TryParse_rejects_invalid_codes(string input)
    {
        AccessCode.TryParse(input, out _).Should().BeFalse();
    }

    [Fact]
    public void Format_inserts_dash_in_the_middle()
    {
        var code = AccessCode.From("ABCD2345");
        code.Formatted.Should().Be("ABCD-2345");
    }
}
```

- [ ] **Step 2: Run the test — expect compilation failure (no `AccessCode` type yet)**

```bash
dotnet test tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj
```

Expected: build error referencing `AccessCode`.

- [ ] **Step 3: Implement `AccessCode`**

Create `src/EventStageTimer.Domain/Common/AccessCode.cs`:

```csharp
using System.Diagnostics.CodeAnalysis;
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
```

- [ ] **Step 4: Add `IClock`, `SystemClock`, and `Result` types**

Create `src/EventStageTimer.Domain/Common/IClock.cs`:

```csharp
namespace EventStageTimer.Domain.Common;

public interface IClock
{
    DateTime UtcNow { get; }
    long UnixTimeMilliseconds => new DateTimeOffset(UtcNow, TimeSpan.Zero).ToUnixTimeMilliseconds();
}
```

Create `src/EventStageTimer.Domain/Common/SystemClock.cs`:

```csharp
namespace EventStageTimer.Domain.Common;

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
```

Create `src/EventStageTimer.Domain/Common/Result.cs`:

```csharp
namespace EventStageTimer.Domain.Common;

public readonly record struct Result<T, TError>
{
    public T? Value { get; }
    public TError? Error { get; }
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    private Result(T value) { Value = value; Error = default; IsSuccess = true; }
    private Result(TError error) { Value = default; Error = error; IsSuccess = false; }

    public static Result<T, TError> Ok(T value) => new(value);
    public static Result<T, TError> Fail(TError error) => new(error);
}
```

- [ ] **Step 5: Run the tests — expect green**

```bash
dotnet test tests/EventStageTimer.Domain.Tests/EventStageTimer.Domain.Tests.csproj
```

Expected: 8 tests pass (4 valid `TryParse` cases + 7 invalid + 1 `Formatted`).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add IClock, AccessCode, Result domain primitives"
```

---

## Task 3: Identity entities — `Tenant`, `User`, `TenantMembership`

**Files:**
- Create: `src/EventStageTimer.Domain/Entities/Tenant.cs`
- Create: `src/EventStageTimer.Domain/Entities/User.cs`
- Create: `src/EventStageTimer.Domain/Entities/TenantMembership.cs`
- Modify: `src/EventStageTimer.Domain/EventStageTimer.Domain.csproj` (reference Identity stores package)

Spec anchors: §5 data model, §9 auth.

- [ ] **Step 1: Add the Identity EF Core package to Domain**

ASP.NET Core Identity's base types live in `Microsoft.Extensions.Identity.Stores`, which `Microsoft.AspNetCore.Identity.EntityFrameworkCore` depends on. We'll add the latter to Infrastructure (where the `DbContext` lives) and only need `Microsoft.AspNetCore.Identity.EntityFrameworkCore`'s base types in Domain. The cleanest cut: keep `User` minimal in Domain (just our fields) and have `User` extend `IdentityUser<Guid>` from Infrastructure-side configuration — but Identity's type lives in `Microsoft.Extensions.Identity.Core`. Add that to Domain so the entity stays in Domain.

```bash
dotnet add src/EventStageTimer.Domain/EventStageTimer.Domain.csproj package Microsoft.Extensions.Identity.Core
```

Update `Directory.Packages.props` to add this version:

```xml
<PackageVersion Include="Microsoft.Extensions.Identity.Core" Version="10.0.0" />
```

- [ ] **Step 2: Add `Tenant` entity**

Create `src/EventStageTimer.Domain/Entities/Tenant.cs`:

```csharp
namespace EventStageTimer.Domain.Entities;

public enum TenantMode
{
    SaaS = 1,
    SelfHost = 2,
}

public class Tenant
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public TenantMode Mode { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
}
```

- [ ] **Step 3: Add `User` entity (extends `IdentityUser<Guid>`)**

Create `src/EventStageTimer.Domain/Entities/User.cs`:

```csharp
using Microsoft.AspNetCore.Identity;

namespace EventStageTimer.Domain.Entities;

public class User : IdentityUser<Guid>
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    // Many-to-many to Tenants via TenantMembership
    public ICollection<TenantMembership> TenantMemberships { get; set; } = [];
}
```

- [ ] **Step 4: Add `TenantMembership` entity**

Create `src/EventStageTimer.Domain/Entities/TenantMembership.cs`:

```csharp
namespace EventStageTimer.Domain.Entities;

public enum TenantRole
{
    Owner = 1,
    Admin = 2,
}

public class TenantMembership
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public TenantRole Role { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
```

- [ ] **Step 5: Build to verify**

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add Tenant, User, TenantMembership entities"
```

---

## Task 4: Event hierarchy — `Event`, `EventMembership`, `EventMembershipRoom`

**Files:**
- Create: `src/EventStageTimer.Domain/Entities/Event.cs`
- Create: `src/EventStageTimer.Domain/Entities/EventMembership.cs`
- Create: `src/EventStageTimer.Domain/Entities/EventMembershipRoom.cs`

Spec anchors: §3 roles, §5 data model.

- [ ] **Step 1: Add `Event` entity**

Create `src/EventStageTimer.Domain/Entities/Event.cs`:

```csharp
using EventStageTimer.Domain.Common;

namespace EventStageTimer.Domain.Entities;

public class Event
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public required string Name { get; set; }
    public required string TimeZone { get; set; } // IANA, e.g. "Europe/Amsterdam"
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public string LobbyAccessCode { get; set; } = null!; // 8 chars, no dash
    public string? LogoBlobKey { get; set; }
    public string ThemeJson { get; set; } = "{}";
    public string DefaultThresholdsJson { get; set; } = "[]";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<Room> Rooms { get; set; } = [];
    public ICollection<EventMembership> Memberships { get; set; } = [];
}
```

- [ ] **Step 2: Add `EventMembership` entity**

Create `src/EventStageTimer.Domain/Entities/EventMembership.cs`:

```csharp
namespace EventStageTimer.Domain.Entities;

public enum EventRole
{
    EventAdmin = 1,
    RoomOperator = 2,
    Viewer = 3,
}

public class EventMembership
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public EventRole Role { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<EventMembershipRoom> ScopedRooms { get; set; } = [];
}
```

- [ ] **Step 3: Add `EventMembershipRoom` join entity**

Create `src/EventStageTimer.Domain/Entities/EventMembershipRoom.cs`:

```csharp
namespace EventStageTimer.Domain.Entities;

public class EventMembershipRoom
{
    public Guid EventMembershipId { get; set; }
    public EventMembership EventMembership { get; set; } = null!;
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
}
```

- [ ] **Step 4: Build to verify**

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
```

(`Room` is referenced but not yet defined — this will fail.)

- [ ] **Step 5: Add a temporary stub for `Room` to keep the build green**

Create `src/EventStageTimer.Domain/Entities/Room.cs` (we'll fully replace this in Task 6):

```csharp
namespace EventStageTimer.Domain.Entities;

// Stub — full definition arrives in Task 6.
public class Room
{
    public Guid Id { get; set; }
}
```

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add Event, EventMembership, EventMembershipRoom entities"
```

---

## Task 5: Invitation entities — `Invitation`, `InvitationRoom`

**Files:**
- Create: `src/EventStageTimer.Domain/Entities/Invitation.cs`
- Create: `src/EventStageTimer.Domain/Entities/InvitationRoom.cs`

Spec anchors: §5 data model, §4.1 members/invitations.

- [ ] **Step 1: Create `Invitation`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class Invitation
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Email { get; set; }
    public EventRole Role { get; set; }
    public required string Token { get; set; } // URL-safe random
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public bool EmailSendFailed { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    public ICollection<InvitationRoom> ScopedRooms { get; set; } = [];
}
```

- [ ] **Step 2: Create `InvitationRoom` join entity**

```csharp
namespace EventStageTimer.Domain.Entities;

public class InvitationRoom
{
    public Guid InvitationId { get; set; }
    public Invitation Invitation { get; set; } = null!;
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
}
```

- [ ] **Step 3: Build to verify**

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add Invitation and InvitationRoom entities"
```

---

## Task 6: `Room` and `ScheduleItem` entities

**Files:**
- Modify (replace stub): `src/EventStageTimer.Domain/Entities/Room.cs`
- Create: `src/EventStageTimer.Domain/Entities/ScheduleItem.cs`

Spec anchors: §5 data model, §4.5 schedule item fields.

- [ ] **Step 1: Replace `Room` stub with full entity**

```csharp
namespace EventStageTimer.Domain.Entities;

public class Room
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Name { get; set; }
    public string AccessCode { get; set; } = null!; // 8 chars, no dash
    public int DefaultPreRollSec { get; set; } = 30;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ScheduleItem> ScheduleItems { get; set; } = [];
    public RoomTimerState? TimerState { get; set; }
}
```

- [ ] **Step 2: Create `ScheduleItem`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class ScheduleItem
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid RoomId { get; set; }
    public Room Room { get; set; } = null!;
    public int Position { get; set; }
    public required string Title { get; set; }
    public string? SpeakerName { get; set; }
    public DateTime ScheduledStartUtc { get; set; }
    public int DurationSec { get; set; }
    public int PreRollSec { get; set; }
    public bool AutoStart { get; set; }
    public string? ThresholdsJson { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }

    public ICollection<ScheduleItemRun> Runs { get; set; } = [];
}
```

(`RoomTimerState` and `ScheduleItemRun` are referenced — they arrive in Task 7. Build will fail until then.)

- [ ] **Step 3: Defer build verification to Task 7 (combined check)**

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: replace Room stub and add ScheduleItem entity"
```

---

## Task 7: Runtime entities — `ScheduleItemRun`, `RoomTimerState`, `TimerPhase`

**Files:**
- Create: `src/EventStageTimer.Domain/Entities/TimerPhase.cs`
- Create: `src/EventStageTimer.Domain/Entities/ScheduleItemRun.cs`
- Create: `src/EventStageTimer.Domain/Entities/RoomTimerState.cs`

Spec anchors: §5 data model, §6.1 phases, §6.2 transitions.

- [ ] **Step 1: Create the `TimerPhase` enum**

```csharp
namespace EventStageTimer.Domain.Entities;

public enum TimerPhase
{
    Idle = 0,
    PreRoll = 1,
    Running = 2,
    Paused = 3,
    Ended = 4,
}
```

> Note: `Overrun` is intentionally not a stored phase — it's derived on the client when `remainingMs ≤ 0` while `Phase = Running` (spec §6.2 final paragraph).

- [ ] **Step 2: Create `ScheduleItemRun`**

```csharp
namespace EventStageTimer.Domain.Entities;

public enum RunTrigger { Operator = 1, Scheduler = 2, Skip = 3 }
public enum RunEndedReason { Stop = 1, Reset = 2, SkipReplaced = 3 }

public class ScheduleItemRun
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ScheduleItemId { get; set; }
    public ScheduleItem ScheduleItem { get; set; } = null!;
    public int RunNumber { get; set; }
    public RunTrigger Trigger { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }
    public RunEndedReason? EndedReason { get; set; }
}
```

- [ ] **Step 3: Create `RoomTimerState`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class RoomTimerState
{
    public Guid RoomId { get; set; } // PK
    public Room Room { get; set; } = null!;
    public Guid TenantId { get; set; }
    public Guid? CurrentItemId { get; set; }
    public ScheduleItem? CurrentItem { get; set; }
    public Guid? CurrentRunId { get; set; }
    public ScheduleItemRun? CurrentRun { get; set; }
    public TimerPhase Phase { get; set; } = TimerPhase.Idle;
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? PreRollEndsAtUtc { get; set; }
    public DateTime? PauseStartedAtUtc { get; set; }
    public int PausedAccumSec { get; set; }
    public int AdjustmentSec { get; set; }
    public string? CurrentMessage { get; set; }
    // SQL Server rowversion (8 bytes). Mapped via [Timestamp] in the EF config.
    public byte[] Version { get; set; } = [];
}
```

- [ ] **Step 4: Build to verify all entities compile together**

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add TimerPhase, ScheduleItemRun, RoomTimerState"
```

---

## Task 8: Misc entities — `MessageTemplate`, `AuditLogEntry`, `AuthMagicLink`, `EmailOutbox`

**Files:**
- Create: `src/EventStageTimer.Domain/Entities/MessageTemplate.cs`
- Create: `src/EventStageTimer.Domain/Entities/AuditLogEntry.cs`
- Create: `src/EventStageTimer.Domain/Entities/AuthMagicLink.cs`
- Create: `src/EventStageTimer.Domain/Entities/EmailOutbox.cs`

Spec anchors: §5 data model, §8 background services, §9 auth.

- [ ] **Step 1: Create `MessageTemplate`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class MessageTemplate
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;
    public required string Text { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
```

- [ ] **Step 2: Create `AuditLogEntry`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class AuditLogEntry
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? EventId { get; set; }
    public Guid? RoomId { get; set; }
    public Guid? UserId { get; set; }
    public required string Action { get; set; } // e.g. "Start", "AdjustTime", "AutoStart"
    public string DetailsJson { get; set; } = "{}";
    public DateTime AtUtc { get; set; }
}
```

- [ ] **Step 3: Create `AuthMagicLink`**

```csharp
namespace EventStageTimer.Domain.Entities;

public class AuthMagicLink
{
    public string Token { get; set; } = null!; // PK; URL-safe random, ≥32 bytes base64
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}
```

- [ ] **Step 4: Create `EmailOutbox` (deferred-use entity, see spec §8)**

```csharp
namespace EventStageTimer.Domain.Entities;

public class EmailOutbox
{
    public Guid Id { get; set; }
    public required string ToAddress { get; set; }
    public required string Subject { get; set; }
    public required string BodyHtml { get; set; }
    public required string BodyText { get; set; }
    public DateTime EnqueuedAt { get; set; }
    public DateTime? SentAt { get; set; }
    public string? LastError { get; set; }
    public int RetryCount { get; set; }
}
```

- [ ] **Step 5: Build + commit**

```bash
dotnet build src/EventStageTimer.Domain/EventStageTimer.Domain.csproj
git add . && git commit -m "feat: add MessageTemplate, AuditLogEntry, AuthMagicLink, EmailOutbox"
```

---

## Task 9: `AppDbContext` and tenancy query filter

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Persistence/AppDbContext.cs`
- Create: `src/EventStageTimer.Infrastructure/Persistence/ModelConfiguration/TenancyQueryFilters.cs`
- Create: `src/EventStageTimer.Infrastructure/Tenancy/ITenantContext.cs`
- Modify: `src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj` (add EF Core packages)

Spec anchors: §5 data model + indexes, §9.2 tenancy.

- [ ] **Step 1: Add EF Core SQL Server + Identity packages to Infrastructure**

```bash
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package Microsoft.EntityFrameworkCore
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package Microsoft.EntityFrameworkCore.SqlServer
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package Microsoft.EntityFrameworkCore.Design
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package Microsoft.AspNetCore.Identity.EntityFrameworkCore
```

- [ ] **Step 2: Create `ITenantContext` (the read-only abstraction; impl in Task 11)**

Create `src/EventStageTimer.Infrastructure/Tenancy/ITenantContext.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Tenancy;

/// <summary>Resolved tenant for the current request or background scope. Empty means "no tenant" (e.g. anonymous public lookup) — query filters then reject access to tenant-scoped tables.</summary>
public interface ITenantContext
{
    Guid? TenantId { get; }
    void Set(Guid tenantId);
}
```

- [ ] **Step 3: Create `AppDbContext`**

Create `src/EventStageTimer.Infrastructure/Persistence/AppDbContext.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence.ModelConfiguration;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options, ITenantContext tenantContext)
    : IdentityDbContext<User, IdentityRole<Guid>, Guid>(options)
{
    private readonly ITenantContext _tenantContext = tenantContext;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<TenantMembership> TenantMemberships => Set<TenantMembership>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<EventMembership> EventMemberships => Set<EventMembership>();
    public DbSet<EventMembershipRoom> EventMembershipRooms => Set<EventMembershipRoom>();
    public DbSet<Invitation> Invitations => Set<Invitation>();
    public DbSet<InvitationRoom> InvitationRooms => Set<InvitationRoom>();
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<ScheduleItem> ScheduleItems => Set<ScheduleItem>();
    public DbSet<ScheduleItemRun> ScheduleItemRuns => Set<ScheduleItemRun>();
    public DbSet<RoomTimerState> RoomTimerStates => Set<RoomTimerState>();
    public DbSet<MessageTemplate> MessageTemplates => Set<MessageTemplate>();
    public DbSet<AuditLogEntry> AuditLog => Set<AuditLogEntry>();
    public DbSet<AuthMagicLink> AuthMagicLinks => Set<AuthMagicLink>();
    public DbSet<EmailOutbox> EmailOutbox => Set<EmailOutbox>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b); // Identity tables

        // Identity tables: change keys to Guid (already because we extend IdentityUser<Guid>)

        // Tenant
        b.Entity<Tenant>(e =>
        {
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Slug).HasMaxLength(64);
            e.Property(x => x.Name).HasMaxLength(200);
        });

        // User
        b.Entity<User>(e =>
        {
            e.Property(x => x.DisplayName).HasMaxLength(200);
        });

        // TenantMembership
        b.Entity<TenantMembership>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.UserId }).IsUnique();
            e.HasOne(x => x.Tenant).WithMany().HasForeignKey(x => x.TenantId);
            e.HasOne(x => x.User).WithMany(u => u.TenantMemberships).HasForeignKey(x => x.UserId);
        });

        // Event
        b.Entity<Event>(e =>
        {
            e.HasIndex(x => x.TenantId);
            e.HasIndex(x => x.LobbyAccessCode).IsUnique(); // GLOBAL uniqueness across tenants
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.TimeZone).HasMaxLength(64);
            e.Property(x => x.LobbyAccessCode).HasMaxLength(8).IsFixedLength();
        });

        // EventMembership
        b.Entity<EventMembership>(e =>
        {
            e.HasIndex(x => new { x.EventId, x.UserId }).IsUnique();
            e.HasOne(x => x.Event).WithMany(ev => ev.Memberships).HasForeignKey(x => x.EventId);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        // EventMembershipRoom (composite key)
        b.Entity<EventMembershipRoom>(e =>
        {
            e.HasKey(x => new { x.EventMembershipId, x.RoomId });
            e.HasOne(x => x.EventMembership).WithMany(em => em.ScopedRooms).HasForeignKey(x => x.EventMembershipId);
            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId);
        });

        // Invitation / InvitationRoom
        b.Entity<Invitation>(e =>
        {
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.Token).HasMaxLength(128);
        });
        b.Entity<InvitationRoom>(e =>
        {
            e.HasKey(x => new { x.InvitationId, x.RoomId });
            e.HasOne(x => x.Invitation).WithMany(i => i.ScopedRooms).HasForeignKey(x => x.InvitationId);
            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId);
        });

        // Room
        b.Entity<Room>(e =>
        {
            e.HasIndex(x => x.EventId);
            e.HasIndex(x => x.AccessCode).IsUnique(); // GLOBAL uniqueness across tenants
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.AccessCode).HasMaxLength(8).IsFixedLength();
            e.HasOne(x => x.Event).WithMany(ev => ev.Rooms).HasForeignKey(x => x.EventId);
        });

        // ScheduleItem
        b.Entity<ScheduleItem>(e =>
        {
            e.HasIndex(x => new { x.RoomId, x.Position });
            e.Property(x => x.Title).HasMaxLength(300);
            e.Property(x => x.SpeakerName).HasMaxLength(200);
            e.HasOne(x => x.Room).WithMany(r => r.ScheduleItems).HasForeignKey(x => x.RoomId);
        });

        // ScheduleItemRun
        b.Entity<ScheduleItemRun>(e =>
        {
            e.HasIndex(x => new { x.ScheduleItemId, x.RunNumber }).IsUnique();
            e.HasOne(x => x.ScheduleItem).WithMany(s => s.Runs).HasForeignKey(x => x.ScheduleItemId);
        });

        // RoomTimerState
        b.Entity<RoomTimerState>(e =>
        {
            e.HasKey(x => x.RoomId);
            e.Property(x => x.Version).IsRowVersion();
            e.Property(x => x.CurrentMessage).HasMaxLength(500);
            e.HasOne(x => x.Room).WithOne(r => r.TimerState).HasForeignKey<RoomTimerState>(x => x.RoomId);
            e.HasOne(x => x.CurrentItem).WithMany().HasForeignKey(x => x.CurrentItemId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CurrentRun).WithMany().HasForeignKey(x => x.CurrentRunId).OnDelete(DeleteBehavior.Restrict);
        });

        // MessageTemplate
        b.Entity<MessageTemplate>(e =>
        {
            e.HasIndex(x => x.EventId);
            e.Property(x => x.Text).HasMaxLength(500);
        });

        // AuditLogEntry
        b.Entity<AuditLogEntry>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.AtUtc });
            e.Property(x => x.Action).HasMaxLength(64);
        });

        // AuthMagicLink
        b.Entity<AuthMagicLink>(e =>
        {
            e.HasKey(x => x.Token);
            e.Property(x => x.Token).HasMaxLength(128);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        // EmailOutbox
        b.Entity<EmailOutbox>(e =>
        {
            e.HasIndex(x => x.SentAt);
            e.Property(x => x.ToAddress).HasMaxLength(320);
            e.Property(x => x.Subject).HasMaxLength(500);
        });

        TenancyQueryFilters.Apply(b, () => _tenantContext.TenantId);
    }
}
```

- [ ] **Step 4: Create the tenancy query-filter helper**

Create `src/EventStageTimer.Infrastructure/Persistence/ModelConfiguration/TenancyQueryFilters.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Persistence.ModelConfiguration;

internal static class TenancyQueryFilters
{
    public static void Apply(ModelBuilder b, Func<Guid?> currentTenantId)
    {
        // Apply to every entity carrying a TenantId column.
        b.Entity<TenantMembership>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Event>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<EventMembership>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Invitation>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<Room>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<ScheduleItem>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<ScheduleItemRun>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<RoomTimerState>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<MessageTemplate>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
        b.Entity<AuditLogEntry>().HasQueryFilter(x => currentTenantId() == null || x.TenantId == currentTenantId());
    }
}
```

> The `currentTenantId() == null` clause is the "system" escape hatch used by background services (scheduler, bootstrap) that operate across tenants. Production endpoints must always set a tenant before querying.

- [ ] **Step 5: Build to verify**

```bash
dotnet build src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: add AppDbContext with tenancy query filters and rowversion for timer state"
```

---

## Task 10: First migration + apply on startup

**Files:**
- Modify: `src/EventStageTimer.Api/Program.cs`
- Modify: `src/EventStageTimer.Api/appsettings.json` (connection string)
- Modify: `src/EventStageTimer.Api/appsettings.Development.json`
- Create: `src/EventStageTimer.Infrastructure/Persistence/Migrations/*` (generated)
- Modify: `src/EventStageTimer.Api/EventStageTimer.Api.csproj` (EF design tool reference)

Spec anchors: §12.4 `Database:AutoMigrate` flag.

- [ ] **Step 1: Add the EF Core design package to the API host (so `dotnet ef` works) and the Identity package**

```bash
dotnet add src/EventStageTimer.Api/EventStageTimer.Api.csproj package Microsoft.EntityFrameworkCore.Design
dotnet add src/EventStageTimer.Api/EventStageTimer.Api.csproj package Microsoft.AspNetCore.Identity.EntityFrameworkCore
dotnet tool install --global dotnet-ef --version 10.0.0 || dotnet tool update --global dotnet-ef --version 10.0.0
```

- [ ] **Step 2: Add a no-op `ITenantContext` registration so `AppDbContext` can be resolved at design time**

For migration generation we need a tenant context, but design-time has no request scope. Add a transient default that just returns null:

Edit `src/EventStageTimer.Infrastructure/Tenancy/ITenantContext.cs` (already created in T9) and add a sibling default:

Create `src/EventStageTimer.Infrastructure/Tenancy/DesignTimeTenantContext.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Tenancy;

/// <summary>Used by EF design-time tooling and tests that don't need tenant scoping.</summary>
public sealed class NullTenantContext : ITenantContext
{
    public Guid? TenantId { get; private set; }
    public void Set(Guid tenantId) => TenantId = tenantId;
}
```

- [ ] **Step 3: Wire DI in `Program.cs` and configure connection string**

Replace `src/EventStageTimer.Api/Program.cs` with:

```csharp
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

// Tenancy
builder.Services.AddScoped<ITenantContext, NullTenantContext>();

// Database
builder.Services.AddDbContext<AppDbContext>(opts =>
    opts.UseSqlServer(
        builder.Configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default is required"),
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

var app = builder.Build();

// Auto-migrate when configured (default true outside Production)
var autoMigrate = builder.Configuration.GetValue<bool?>("Database:AutoMigrate")
    ?? !builder.Environment.IsProduction();
if (autoMigrate)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

app.MapControllers();
app.MapOpenApi();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

public partial class Program { }
```

- [ ] **Step 4: Provide a default connection string and the dev override**

Replace `src/EventStageTimer.Api/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "Default": "Server=(local);Database=EventStageTimer;Integrated Security=true;TrustServerCertificate=true"
  },
  "Database": {
    "AutoMigrate": true
  }
}
```

Replace `src/EventStageTimer.Api/appsettings.Development.json`:

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost,1433;Database=EventStageTimer.Dev;User Id=sa;Password=Your_strong_password_123;TrustServerCertificate=true"
  },
  "Database": {
    "AutoMigrate": true
  }
}
```

> The dev connection string assumes the docker-compose SQL Server we'll add in Plan 5. For local dev right now, run `docker run -d -p 1433:1433 -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=Your_strong_password_123 mcr.microsoft.com/mssql/server:2022-latest`.

- [ ] **Step 5: Generate the initial migration**

```bash
dotnet ef migrations add Initial \
  --project src/EventStageTimer.Infrastructure \
  --startup-project src/EventStageTimer.Api \
  --output-dir Persistence/Migrations
```

Expected: a new folder `src/EventStageTimer.Infrastructure/Persistence/Migrations/` with two files (`<timestamp>_Initial.cs` and `AppDbContextModelSnapshot.cs`).

- [ ] **Step 6: Verify migration applies against a real SQL Server**

```bash
dotnet run --project src/EventStageTimer.Api -- --urls http://localhost:5050 &
SERVER_PID=$!
sleep 3
curl -sf http://localhost:5050/health
kill $SERVER_PID
```

Expected: `{"status":"ok"}` and the database `EventStageTimer.Dev` exists with `__EFMigrationsHistory` populated.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "feat: wire DbContext + initial migration with auto-apply on startup"
```

---

## Task 11: Tenant resolution middleware and `TenantContext`

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Tenancy/TenantContext.cs`
- Create: `src/EventStageTimer.Api/Middleware/TenantResolutionMiddleware.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`

Spec anchors: §9.2 multi-tenancy, §11 access codes resolving tenant from URL.

- [ ] **Step 1: Replace `NullTenantContext` registration with the request-scoped `TenantContext`**

Create `src/EventStageTimer.Infrastructure/Tenancy/TenantContext.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Tenancy;

public sealed class TenantContext : ITenantContext
{
    public Guid? TenantId { get; private set; }
    public void Set(Guid tenantId)
    {
        if (TenantId is { } existing && existing != tenantId)
            throw new InvalidOperationException($"TenantContext already set to {existing}; cannot change to {tenantId}");
        TenantId = tenantId;
    }
}
```

- [ ] **Step 2: Add the resolution middleware**

Create `src/EventStageTimer.Api/Middleware/TenantResolutionMiddleware.cs`:

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Middleware;

public sealed class TenantResolutionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx, ITenantContext tenantContext, AppDbContext db)
    {
        // 1. Authenticated requests carry a "tid" claim.
        var tid = ctx.User.FindFirstValue("tid");
        if (Guid.TryParse(tid, out var fromClaim))
        {
            tenantContext.Set(fromClaim);
            await next(ctx);
            return;
        }

        // 2. Public surfaces resolve tenant from the access code in the path.
        if (TryExtractAccessCode(ctx.Request.Path, out var raw) && AccessCode.TryParse(raw, out var code))
        {
            // Look up across tenants without filter (system-level read).
            var tenantId = await db.Rooms
                .IgnoreQueryFilters()
                .Where(r => r.AccessCode == code.Value)
                .Select(r => (Guid?)r.TenantId)
                .FirstOrDefaultAsync();
            tenantId ??= await db.Events
                .IgnoreQueryFilters()
                .Where(e => e.LobbyAccessCode == code.Value)
                .Select(e => (Guid?)e.TenantId)
                .FirstOrDefaultAsync();

            if (tenantId is { } resolved)
                tenantContext.Set(resolved);
        }

        await next(ctx);
    }

    private static bool TryExtractAccessCode(PathString path, out string raw)
    {
        raw = "";
        var s = path.Value ?? "";
        // /r/{code}/...  or  /e/{code}/...
        if ((s.StartsWith("/r/", StringComparison.Ordinal) || s.StartsWith("/e/", StringComparison.Ordinal)) && s.Length > 3)
        {
            var rest = s[3..];
            var slash = rest.IndexOf('/');
            raw = slash < 0 ? rest : rest[..slash];
            return true;
        }
        return false;
    }
}
```

- [ ] **Step 3: Register middleware and switch `ITenantContext` to scoped impl**

Edit `src/EventStageTimer.Api/Program.cs`:

```csharp
// existing: builder.Services.AddScoped<ITenantContext, NullTenantContext>();
// change to:
builder.Services.AddScoped<ITenantContext, EventStageTimer.Infrastructure.Tenancy.TenantContext>();
```

And in the request pipeline, before `MapControllers`:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<EventStageTimer.Api.Middleware.TenantResolutionMiddleware>();
```

> Authentication/authorization handlers are added in Tasks 24+; they need to run before the middleware so `ctx.User` is populated.

- [ ] **Step 4: Build to verify**

```bash
dotnet build EventStageTimer.sln
```

Expected: build succeeds (auth handlers not yet registered, but middleware doesn't hard-fail on absence).

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: tenant resolution middleware + TenantContext scoped impl"
```

---

## Task 12: `TimerStateMachine` — pure domain logic

**Files:**
- Create: `src/EventStageTimer.Domain/Timer/TimerStateMachine.cs`
- Create: `src/EventStageTimer.Domain/Timer/TimerCommandError.cs`
- Test: `tests/EventStageTimer.Domain.Tests/Timer/TimerStateMachineTests.cs`

Spec anchors: §6.1, §6.2 transition table, §4.5 command semantics.

- [ ] **Step 1: Define the error enum**

Create `src/EventStageTimer.Domain/Timer/TimerCommandError.cs`:

```csharp
namespace EventStageTimer.Domain.Timer;

public enum TimerCommandError
{
    InvalidPhase = 1,
    StaleVersion = 2,
    AdjustmentOutOfBounds = 3,
    NoActiveItem = 4,
    NoNextItem = 5,
}
```

- [ ] **Step 2: Write failing tests for the simplest transitions first**

Create `tests/EventStageTimer.Domain.Tests/Timer/TimerStateMachineTests.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Timer;

public class TimerStateMachineTests
{
    private static readonly DateTime Now = new(2026, 5, 10, 14, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void StartItem_with_no_preroll_goes_directly_to_Running()
    {
        var state = NewIdleState();
        var item = NewItem(durationSec: 1800, preRollSec: 0);

        var result = TimerStateMachine.StartItem(state, item, Now);

        result.IsSuccess.Should().BeTrue();
        state.Phase.Should().Be(TimerPhase.Running);
        state.StartedAtUtc.Should().Be(Now);
        state.PreRollEndsAtUtc.Should().BeNull();
        state.CurrentItemId.Should().Be(item.Id);
    }

    [Fact]
    public void StartItem_with_preroll_goes_to_PreRoll_with_correct_end_time()
    {
        var state = NewIdleState();
        var item = NewItem(durationSec: 1800, preRollSec: 30);

        TimerStateMachine.StartItem(state, item, Now);

        state.Phase.Should().Be(TimerPhase.PreRoll);
        state.PreRollEndsAtUtc.Should().Be(Now.AddSeconds(30));
        state.StartedAtUtc.Should().BeNull();
    }

    [Fact]
    public void StartItem_rejects_when_not_idle()
    {
        var state = NewIdleState();
        state.Phase = TimerPhase.Running;

        var result = TimerStateMachine.StartItem(state, NewItem(), Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(TimerCommandError.InvalidPhase);
    }

    [Fact]
    public void ExpirePreRoll_sets_StartedAtUtc_to_PreRollEndsAtUtc_not_now()
    {
        var state = NewIdleState();
        state.Phase = TimerPhase.PreRoll;
        state.CurrentItemId = Guid.NewGuid();
        state.PreRollEndsAtUtc = Now;

        // Tick fires 800ms late.
        TimerStateMachine.ExpirePreRoll(state, Now.AddMilliseconds(800));

        state.Phase.Should().Be(TimerPhase.Running);
        state.StartedAtUtc.Should().Be(Now); // NOT Now+800ms
        state.PreRollEndsAtUtc.Should().BeNull();
    }

    [Fact]
    public void Pause_then_Resume_accumulates_paused_seconds()
    {
        var state = RunningState(startedAt: Now);

        TimerStateMachine.Pause(state, Now.AddSeconds(60));
        TimerStateMachine.Resume(state, Now.AddSeconds(75));

        state.Phase.Should().Be(TimerPhase.Running);
        state.PausedAccumSec.Should().Be(15);
        state.PauseStartedAtUtc.Should().BeNull();
    }

    [Fact]
    public void AdjustTime_within_bounds_succeeds()
    {
        var state = RunningState(startedAt: Now);
        var r = TimerStateMachine.AdjustTime(state, deltaSec: 30);
        r.IsSuccess.Should().BeTrue();
        state.AdjustmentSec.Should().Be(30);
    }

    [Fact]
    public void AdjustTime_beyond_24h_is_rejected()
    {
        var state = RunningState(startedAt: Now);
        var r = TimerStateMachine.AdjustTime(state, deltaSec: 25 * 3600);
        r.IsFailure.Should().BeTrue();
        r.Error.Should().Be(TimerCommandError.AdjustmentOutOfBounds);
    }

    [Fact]
    public void Reset_clears_timer_fields_and_message_but_preserves_CurrentItemId()
    {
        var state = RunningState(startedAt: Now);
        state.CurrentMessage = "Wrap up";
        state.AdjustmentSec = 30;

        TimerStateMachine.Reset(state);

        state.Phase.Should().Be(TimerPhase.Idle);
        state.StartedAtUtc.Should().BeNull();
        state.AdjustmentSec.Should().Be(0);
        state.CurrentMessage.Should().BeNull();
        state.CurrentItemId.Should().NotBeNull(); // preserved
    }

    private static RoomTimerState NewIdleState() => new()
    {
        RoomId = Guid.NewGuid(),
        Phase = TimerPhase.Idle,
    };

    private static RoomTimerState RunningState(DateTime startedAt) => new()
    {
        RoomId = Guid.NewGuid(),
        Phase = TimerPhase.Running,
        CurrentItemId = Guid.NewGuid(),
        StartedAtUtc = startedAt,
    };

    private static ScheduleItem NewItem(int durationSec = 1800, int preRollSec = 30) => new()
    {
        Id = Guid.NewGuid(),
        Title = "Test",
        DurationSec = durationSec,
        PreRollSec = preRollSec,
    };
}
```

- [ ] **Step 3: Run tests — expect compilation failure (no `TimerStateMachine` yet)**

```bash
dotnet test tests/EventStageTimer.Domain.Tests
```

Expected: build error referencing `TimerStateMachine`.

- [ ] **Step 4: Implement `TimerStateMachine`**

Create `src/EventStageTimer.Domain/Timer/TimerStateMachine.cs`:

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;

namespace EventStageTimer.Domain.Timer;

/// <summary>
/// Pure functions that mutate a <see cref="RoomTimerState"/> per the spec's transition table.
/// No I/O — all DB writes happen in the calling service. <see cref="ScheduleItemRun"/> rows
/// are created/closed by the caller using the lifecycle returned via out parameters.
/// </summary>
public static class TimerStateMachine
{
    private const int MaxAdjustmentSec = 24 * 3600;
    private const int MinAdjustmentSec = -24 * 3600;

    public static Result<Unit, TimerCommandError> StartItem(RoomTimerState state, ScheduleItem item, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Idle)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);

        state.CurrentItemId = item.Id;
        state.AdjustmentSec = 0;
        state.PausedAccumSec = 0;
        state.PauseStartedAtUtc = null;

        if (item.PreRollSec > 0)
        {
            state.Phase = TimerPhase.PreRoll;
            state.PreRollEndsAtUtc = nowUtc.AddSeconds(item.PreRollSec);
            state.StartedAtUtc = null;
        }
        else
        {
            state.Phase = TimerPhase.Running;
            state.StartedAtUtc = nowUtc;
            state.PreRollEndsAtUtc = null;
        }
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static void ExpirePreRoll(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.PreRoll || state.PreRollEndsAtUtc is null) return;
        // Use the intended expiry timestamp, not nowUtc — avoids drift from 1Hz tick.
        state.StartedAtUtc = state.PreRollEndsAtUtc.Value;
        state.PreRollEndsAtUtc = null;
        state.Phase = TimerPhase.Running;
    }

    public static Result<Unit, TimerCommandError> Pause(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Running)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        state.PauseStartedAtUtc = nowUtc;
        state.Phase = TimerPhase.Paused;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> Resume(RoomTimerState state, DateTime nowUtc)
    {
        if (state.Phase != TimerPhase.Paused || state.PauseStartedAtUtc is null)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        var pausedFor = (int)(nowUtc - state.PauseStartedAtUtc.Value).TotalSeconds;
        state.PausedAccumSec += pausedFor;
        state.PauseStartedAtUtc = null;
        state.Phase = TimerPhase.Running;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> Stop(RoomTimerState state)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        state.Phase = TimerPhase.Ended;
        state.StartedAtUtc = null;
        state.PausedAccumSec = 0;
        state.AdjustmentSec = 0;
        state.PauseStartedAtUtc = null;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static void Reset(RoomTimerState state)
    {
        state.Phase = TimerPhase.Idle;
        state.StartedAtUtc = null;
        state.PreRollEndsAtUtc = null;
        state.PauseStartedAtUtc = null;
        state.PausedAccumSec = 0;
        state.AdjustmentSec = 0;
        state.CurrentMessage = null;
        // CurrentItemId preserved per spec §6.2
    }

    public static Result<Unit, TimerCommandError> AdjustTime(RoomTimerState state, int deltaSec)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        var proposed = state.AdjustmentSec + deltaSec;
        if (proposed < MinAdjustmentSec || proposed > MaxAdjustmentSec)
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.AdjustmentOutOfBounds);
        state.AdjustmentSec = proposed;
        return Result<Unit, TimerCommandError>.Ok(Unit.Value);
    }

    public static Result<Unit, TimerCommandError> SetExactRemaining(
        RoomTimerState state, ScheduleItem currentItem, int remainingSec, DateTime nowUtc)
    {
        if (state.Phase is not (TimerPhase.Running or TimerPhase.Paused))
            return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);
        if (state.StartedAtUtc is null) return Result<Unit, TimerCommandError>.Fail(TimerCommandError.InvalidPhase);

        var elapsed = (nowUtc - state.StartedAtUtc.Value).TotalSeconds - state.PausedAccumSec;
        var currentEffectiveTotal = currentItem.DurationSec + state.AdjustmentSec;
        var currentRemaining = currentEffectiveTotal - elapsed;
        var delta = remainingSec - (int)currentRemaining;
        return AdjustTime(state, delta);
    }

    public static void SetMessage(RoomTimerState state, string? message)
    {
        state.CurrentMessage = string.IsNullOrEmpty(message) ? null : message;
        // Last-write-wins. Caller does NOT bump Version.
    }
}

public readonly record struct Unit
{
    public static readonly Unit Value = default;
}
```

- [ ] **Step 5: Run tests — expect green**

```bash
dotnet test tests/EventStageTimer.Domain.Tests
```

Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: TimerStateMachine pure-domain logic with TDD coverage"
```

---

## Task 13: Server-side `Snapshot` DTO + thresholds parsing

**Files:**
- Create: `src/EventStageTimer.Domain/Timer/Snapshot.cs`
- Create: `src/EventStageTimer.Domain/Timer/Threshold.cs`
- Test: `tests/EventStageTimer.Domain.Tests/Timer/ThresholdSelectionTests.cs`

Spec anchors: §6.3 client display computation (server emits the data the client needs), §6.4 snapshot payload.

- [ ] **Step 1: Define `Threshold` and `Snapshot` records**

Create `src/EventStageTimer.Domain/Timer/Threshold.cs`:

```csharp
namespace EventStageTimer.Domain.Timer;

public sealed record Threshold(int SecondsRemaining, string ColorToken, string? Label = null);
```

Create `src/EventStageTimer.Domain/Timer/Snapshot.cs`:

```csharp
using EventStageTimer.Domain.Entities;

namespace EventStageTimer.Domain.Timer;

public sealed record SnapshotItem(Guid Id, string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, IReadOnlyList<Threshold> Thresholds);
public sealed record SnapshotNextItem(Guid Id, string Title, DateTime ScheduledStartUtc);

public sealed record Snapshot(
    Guid RoomId,
    SnapshotItem? CurrentItem,
    Guid? CurrentRunId,
    SnapshotNextItem? NextItem,
    TimerPhase Phase,
    DateTime? StartedAtUtc,
    DateTime? PreRollEndsAtUtc,
    DateTime? PauseStartedAtUtc,
    int PausedAccumSec,
    int AdjustmentSec,
    int? PauseRemainingMs,
    string? CurrentMessage,
    DateTime ServerNowUtc,
    long Version);
```

- [ ] **Step 2: Add helpers — `ThresholdParser`, `ThresholdSelector`**

Add these as static classes in `src/EventStageTimer.Domain/Timer/Threshold.cs`:

```csharp
using System.Text.Json;

namespace EventStageTimer.Domain.Timer;

public sealed record Threshold(int SecondsRemaining, string ColorToken, string? Label = null);

public static class ThresholdParser
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<Threshold> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "[]") return [];
        return JsonSerializer.Deserialize<List<Threshold>>(json, Options) ?? [];
    }

    public static string Serialize(IEnumerable<Threshold> thresholds) =>
        JsonSerializer.Serialize(thresholds, Options);
}

public static class ThresholdSelector
{
    /// <summary>
    /// Picks the smallest <see cref="Threshold.SecondsRemaining"/> still ≥ <paramref name="remainingMs"/>/1000
    /// — the tightest threshold we've crossed but not yet crossed past. Returns null if no threshold matches.
    /// </summary>
    public static Threshold? Active(IReadOnlyList<Threshold> thresholds, double remainingMs)
    {
        if (remainingMs <= 0 || thresholds.Count == 0) return null;
        Threshold? best = null;
        foreach (var t in thresholds)
        {
            if (t.SecondsRemaining * 1000.0 < remainingMs) continue; // not crossed
            if (best is null || t.SecondsRemaining < best.SecondsRemaining)
                best = t;
        }
        return best;
    }
}
```

- [ ] **Step 3: Write threshold-selector tests**

Create `tests/EventStageTimer.Domain.Tests/Timer/ThresholdSelectionTests.cs`:

```csharp
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Xunit;

namespace EventStageTimer.Domain.Tests.Timer;

public class ThresholdSelectionTests
{
    private static readonly IReadOnlyList<Threshold> Thresholds =
    [
        new(600, "warning"),
        new(120, "danger"),
        new(30,  "final"),
    ];

    [Theory]
    [InlineData(700_000, null)]    // no threshold matches
    [InlineData(500_000, "warning")] // only 600 matches; pick 600
    [InlineData(100_000, "danger")]  // 600 + 120 match; pick 120 (smallest)
    [InlineData( 20_000, "final")]   // 600 + 120 + 30 match; pick 30
    [InlineData(    0,    null)]     // overrun branch — caller picks --overrun
    [InlineData(  -100,   null)]
    public void Active_picks_smallest_matching_threshold(double remainingMs, string? expectedToken)
    {
        var t = ThresholdSelector.Active(Thresholds, remainingMs);
        t?.ColorToken.Should().Be(expectedToken);
        if (expectedToken is null) t.Should().BeNull();
    }

    [Fact]
    public void Empty_thresholds_returns_null()
    {
        ThresholdSelector.Active([], 50_000).Should().BeNull();
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/EventStageTimer.Domain.Tests
```

Expected: all tests pass (the prior 8 + 7 new threshold cases).

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: Snapshot DTO + threshold parsing/selection (smallest-matching)"
```

---

## Task 14: `TimerCommandService` — orchestrates DB writes around the state machine

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`
- Create: `src/EventStageTimer.Infrastructure/Timer/ITimerCommandService.cs`
- Create: `src/EventStageTimer.Infrastructure/Timer/TimerOperationResult.cs`

Spec anchors: §4.5 commands, §6.2 transitions (inserting/closing `ScheduleItemRun`), §9 audit.

- [ ] **Step 1: Define the result type used by the hub layer**

Create `src/EventStageTimer.Infrastructure/Timer/TimerOperationResult.cs`:

```csharp
using EventStageTimer.Domain.Timer;

namespace EventStageTimer.Infrastructure.Timer;

public enum TimerOperationOutcome
{
    Ok = 0,
    StaleVersion = 1,
    InvalidPhase = 2,
    AdjustmentOutOfBounds = 3,
    NoActiveItem = 4,
    NoNextItem = 5,
    NotFound = 6,
}

public sealed record TimerOperationResult(TimerOperationOutcome Outcome, Snapshot? Snapshot, string? Message = null)
{
    public bool IsSuccess => Outcome == TimerOperationOutcome.Ok;
    public static TimerOperationResult Ok(Snapshot s) => new(TimerOperationOutcome.Ok, s);
    public static TimerOperationResult Fail(TimerOperationOutcome o, string? msg = null) => new(o, null, msg);
}
```

- [ ] **Step 2: Define the service interface**

Create `src/EventStageTimer.Infrastructure/Timer/ITimerCommandService.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Timer;

public interface ITimerCommandService
{
    Task<TimerOperationResult> StartItemAsync(Guid roomId, Guid scheduleItemId, RunTriggerKind trigger, long? expectedVersion, Guid? userId, CancellationToken ct);
    Task<TimerOperationResult> StartAutoAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> PauseAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> ResumeAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> StopAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> ResetAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SkipNextAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> AdjustTimeAsync(Guid roomId, int deltaSec, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SetExactRemainingAsync(Guid roomId, int remainingSec, long expectedVersion, Guid userId, CancellationToken ct);
    Task<TimerOperationResult> SetMessageAsync(Guid roomId, string? message, Guid userId, CancellationToken ct); // unversioned
    Task<TimerOperationResult> ExpirePreRollAsync(Guid roomId, CancellationToken ct); // scheduler-driven, unversioned
    Task<Snapshot?> GetSnapshotAsync(Guid roomId, CancellationToken ct);
}

public enum RunTriggerKind { Operator = 1, Scheduler = 2, Skip = 3 }
```

- [ ] **Step 3: Skeleton implementation (only `GetSnapshotAsync` and `StartItemAsync` for now)**

Create `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`:

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Timer;

public sealed class TimerCommandService(AppDbContext db, IClock clock) : ITimerCommandService
{
    public async Task<Snapshot?> GetSnapshotAsync(Guid roomId, CancellationToken ct)
    {
        var state = await db.RoomTimerStates
            .Include(s => s.CurrentItem)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        return state is null ? null : await BuildSnapshotAsync(state, ct);
    }

    public async Task<TimerOperationResult> StartItemAsync(
        Guid roomId, Guid scheduleItemId, RunTriggerKind trigger, long? expectedVersion, Guid? userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.RoomTimerStates
            .Include(s => s.CurrentItem)
            .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
        if (state is null) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);

        if (expectedVersion is { } expected && BitConverter.ToInt64(state.Version, 0) != expected)
            return TimerOperationResult.Fail(TimerOperationOutcome.StaleVersion);

        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == scheduleItemId && s.RoomId == roomId, ct);
        if (item is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);

        var sm = TimerStateMachine.StartItem(state, item, clock.UtcNow);
        if (sm.IsFailure) return TimerOperationResult.Fail(MapError(sm.Error));

        // Insert a new ScheduleItemRun.
        var nextRunNumber = await db.ScheduleItemRuns
            .Where(r => r.ScheduleItemId == item.Id)
            .Select(r => (int?)r.RunNumber).MaxAsync(ct) ?? 0;
        var run = new ScheduleItemRun
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            ScheduleItemId = item.Id,
            RunNumber = nextRunNumber + 1,
            Trigger = (Domain.Entities.RunTrigger)(int)trigger,
            StartedAtUtc = clock.UtcNow,
        };
        db.ScheduleItemRuns.Add(run);
        state.CurrentRunId = run.Id;

        // Audit
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = state.TenantId,
            RoomId = roomId,
            UserId = userId,
            Action = trigger == RunTriggerKind.Scheduler ? "AutoStart" : "Start",
            DetailsJson = $"{{\"scheduleItemId\":\"{item.Id}\",\"trigger\":\"{trigger}\"}}",
            AtUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return TimerOperationResult.Ok((await BuildSnapshotAsync(state, ct))!);
    }

    // ... remaining methods stubbed in Task 15-19 ...
    public Task<TimerOperationResult> StartAutoAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> PauseAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> ResumeAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> StopAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> ResetAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> SkipNextAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> AdjustTimeAsync(Guid roomId, int deltaSec, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> SetExactRemainingAsync(Guid roomId, int remainingSec, long expectedVersion, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> SetMessageAsync(Guid roomId, string? message, Guid userId, CancellationToken ct) => throw new NotImplementedException();
    public Task<TimerOperationResult> ExpirePreRollAsync(Guid roomId, CancellationToken ct) => throw new NotImplementedException();

    private async Task<Snapshot?> BuildSnapshotAsync(RoomTimerState s, CancellationToken ct)
    {
        SnapshotItem? cur = null;
        if (s.CurrentItem is not null)
            cur = new SnapshotItem(
                s.CurrentItem.Id, s.CurrentItem.Title, s.CurrentItem.SpeakerName,
                s.CurrentItem.ScheduledStartUtc, s.CurrentItem.DurationSec, s.CurrentItem.PreRollSec,
                ThresholdParser.Parse(s.CurrentItem.ThresholdsJson));

        SnapshotNextItem? next = null;
        if (s.CurrentItem is not null)
        {
            var n = await db.ScheduleItems
                .Where(x => x.RoomId == s.RoomId && x.Position > s.CurrentItem.Position)
                .OrderBy(x => x.Position)
                .Select(x => new { x.Id, x.Title, x.ScheduledStartUtc })
                .FirstOrDefaultAsync(ct);
            if (n is not null) next = new SnapshotNextItem(n.Id, n.Title, n.ScheduledStartUtc);
        }

        int? pauseRemainingMs = null;
        if (s.Phase == TimerPhase.Paused && s.StartedAtUtc is not null && s.CurrentItem is not null && s.PauseStartedAtUtc is not null)
        {
            var elapsed = (s.PauseStartedAtUtc.Value - s.StartedAtUtc.Value).TotalSeconds - s.PausedAccumSec;
            pauseRemainingMs = (int)((s.CurrentItem.DurationSec + s.AdjustmentSec - elapsed) * 1000);
        }

        return new Snapshot(
            s.RoomId, cur, s.CurrentRunId, next, s.Phase,
            s.StartedAtUtc, s.PreRollEndsAtUtc, s.PauseStartedAtUtc,
            s.PausedAccumSec, s.AdjustmentSec, pauseRemainingMs,
            s.CurrentMessage, clock.UtcNow,
            BitConverter.ToInt64(s.Version, 0));
    }

    private static TimerOperationOutcome MapError(TimerCommandError e) => e switch
    {
        TimerCommandError.InvalidPhase => TimerOperationOutcome.InvalidPhase,
        TimerCommandError.AdjustmentOutOfBounds => TimerOperationOutcome.AdjustmentOutOfBounds,
        TimerCommandError.NoActiveItem => TimerOperationOutcome.NoActiveItem,
        TimerCommandError.NoNextItem => TimerOperationOutcome.NoNextItem,
        _ => TimerOperationOutcome.InvalidPhase,
    };
}
```

- [ ] **Step 4: Wire registration in `Program.cs`**

Add to `Program.cs` after the `AddDbContext` line:

```csharp
builder.Services.AddSingleton<EventStageTimer.Domain.Common.IClock, EventStageTimer.Domain.Common.SystemClock>();
builder.Services.AddScoped<EventStageTimer.Infrastructure.Timer.ITimerCommandService, EventStageTimer.Infrastructure.Timer.TimerCommandService>();
```

- [ ] **Step 5: Build to verify**

```bash
dotnet build EventStageTimer.sln
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: TimerCommandService skeleton + StartItem orchestration with run + audit"
```

---

## Task 15: Implement `Pause` and `Resume` in `TimerCommandService`

**Files:**
- Modify: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`

- [ ] **Step 1: Add a private helper to load + version-check + save**

Above the existing methods in `TimerCommandService`, add:

```csharp
private async Task<(RoomTimerState? state, TimerOperationOutcome? failure)> LoadForCommandAsync(
    Guid roomId, long expectedVersion, CancellationToken ct)
{
    var state = await db.RoomTimerStates
        .Include(s => s.CurrentItem)
        .FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
    if (state is null) return (null, TimerOperationOutcome.NotFound);
    if (BitConverter.ToInt64(state.Version, 0) != expectedVersion)
        return (null, TimerOperationOutcome.StaleVersion);
    return (state, null);
}

private async Task<TimerOperationResult> PersistAndReturnAsync(RoomTimerState state, CancellationToken ct)
{
    await db.SaveChangesAsync(ct);
    var snapshot = await BuildSnapshotAsync(state, ct);
    return TimerOperationResult.Ok(snapshot!);
}

private void Audit(RoomTimerState state, Guid? userId, string action, string detailsJson)
{
    db.AuditLog.Add(new AuditLogEntry
    {
        Id = Guid.NewGuid(),
        TenantId = state.TenantId,
        RoomId = state.RoomId,
        UserId = userId,
        Action = action,
        DetailsJson = detailsJson,
        AtUtc = clock.UtcNow,
    });
}
```

- [ ] **Step 2: Replace the `PauseAsync` stub**

```csharp
public async Task<TimerOperationResult> PauseAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);
    var r = TimerStateMachine.Pause(state, clock.UtcNow);
    if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
    Audit(state, userId, "Pause", "{}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 3: Replace the `ResumeAsync` stub**

```csharp
public async Task<TimerOperationResult> ResumeAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);
    var r = TimerStateMachine.Resume(state, clock.UtcNow);
    if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
    Audit(state, userId, "Resume", "{}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 4: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: implement Pause/Resume command service methods"
```

---

## Task 16: Implement `Stop` and `Reset`

**Files:**
- Modify: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`

- [ ] **Step 1: Replace `StopAsync` — must close the active `ScheduleItemRun`**

```csharp
public async Task<TimerOperationResult> StopAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);
    var r = TimerStateMachine.Stop(state);
    if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));

    if (state.CurrentRunId is { } runId)
    {
        var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
        if (run is not null)
        {
            run.EndedAtUtc = clock.UtcNow;
            run.EndedReason = RunEndedReason.Stop;
        }
        state.CurrentRunId = null;
    }
    Audit(state, userId, "Stop", "{}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 2: Replace `ResetAsync`**

```csharp
public async Task<TimerOperationResult> ResetAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);

    if (state.CurrentRunId is { } runId)
    {
        var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
        if (run is not null)
        {
            run.EndedAtUtc = clock.UtcNow;
            run.EndedReason = RunEndedReason.Reset;
        }
        state.CurrentRunId = null;
    }

    TimerStateMachine.Reset(state);
    Audit(state, userId, "Reset", "{}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: implement Stop and Reset (close run + audit)"
```

---

## Task 17: Implement `SkipNext` (atomic stop-current + start-next)

**Files:**
- Modify: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`

Spec anchor: §4.5 Skip-next is atomic Stop + StartItem(next).

- [ ] **Step 1: Replace the `SkipNextAsync` stub**

```csharp
public async Task<TimerOperationResult> SkipNextAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);

    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);

    // Determine next item by Position with no closed run.
    Guid? nextItemId = null;
    if (state.CurrentItem is not null)
    {
        nextItemId = await db.ScheduleItems
            .Where(s => s.RoomId == roomId && s.Position > state.CurrentItem.Position
                        && !s.Runs.Any(r => r.EndedAtUtc != null))
            .OrderBy(s => s.Position)
            .Select(s => (Guid?)s.Id)
            .FirstOrDefaultAsync(ct);
    }
    if (nextItemId is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoNextItem);

    // Close current run with SkipReplaced
    if (state.CurrentRunId is { } runId)
    {
        var run = await db.ScheduleItemRuns.FirstOrDefaultAsync(x => x.Id == runId, ct);
        if (run is not null)
        {
            run.EndedAtUtc = clock.UtcNow;
            run.EndedReason = RunEndedReason.SkipReplaced;
        }
        state.CurrentRunId = null;
    }

    // Force phase to Idle so StartItem precondition is met
    state.Phase = TimerPhase.Idle;

    var nextItem = await db.ScheduleItems.FirstAsync(x => x.Id == nextItemId.Value, ct);
    var sm = TimerStateMachine.StartItem(state, nextItem, clock.UtcNow);
    if (sm.IsFailure) return TimerOperationResult.Fail(MapError(sm.Error));

    var nextRunNumber = await db.ScheduleItemRuns.Where(r => r.ScheduleItemId == nextItem.Id).Select(r => (int?)r.RunNumber).MaxAsync(ct) ?? 0;
    var newRun = new ScheduleItemRun
    {
        Id = Guid.NewGuid(),
        TenantId = state.TenantId,
        ScheduleItemId = nextItem.Id,
        RunNumber = nextRunNumber + 1,
        Trigger = RunTrigger.Skip,
        StartedAtUtc = clock.UtcNow,
    };
    db.ScheduleItemRuns.Add(newRun);
    state.CurrentRunId = newRun.Id;

    Audit(state, userId, "SkipNext", $"{{\"nextItemId\":\"{nextItem.Id}\"}}");

    var saved = await PersistAndReturnAsync(state, ct);
    await tx.CommitAsync(ct);
    return saved;
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: SkipNext as atomic stop-current + start-next within a transaction"
```

---

## Task 18: Implement `AdjustTime` and `SetExactRemaining`

**Files:**
- Modify: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`

- [ ] **Step 1: Replace `AdjustTimeAsync`**

```csharp
public async Task<TimerOperationResult> AdjustTimeAsync(Guid roomId, int deltaSec, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);
    var r = TimerStateMachine.AdjustTime(state, deltaSec);
    if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
    Audit(state, userId, "AdjustTime", $"{{\"deltaSec\":{deltaSec}}}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 2: Replace `SetExactRemainingAsync`**

```csharp
public async Task<TimerOperationResult> SetExactRemainingAsync(Guid roomId, int remainingSec, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);
    if (state.CurrentItem is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);
    var r = TimerStateMachine.SetExactRemaining(state, state.CurrentItem, remainingSec, clock.UtcNow);
    if (r.IsFailure) return TimerOperationResult.Fail(MapError(r.Error));
    Audit(state, userId, "SetExactRemaining", $"{{\"remainingSec\":{remainingSec}}}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: AdjustTime and SetExactRemaining implementations"
```

---

## Task 19: Implement `SetMessage`, `StartAuto`, `ExpirePreRoll`

**Files:**
- Modify: `src/EventStageTimer.Infrastructure/Timer/TimerCommandService.cs`

Spec anchors: §4.5 SetMessage last-write-wins, §4.5 Start auto-select, §6.2 PreRoll → Running.

- [ ] **Step 1: Replace `SetMessageAsync` (unversioned, doesn't bump `Version`)**

```csharp
public async Task<TimerOperationResult> SetMessageAsync(Guid roomId, string? message, Guid userId, CancellationToken ct)
{
    // Direct update bypasses optimistic concurrency on Version. We use ExecuteUpdateAsync to avoid loading the row.
    var rows = await db.RoomTimerStates
        .Where(s => s.RoomId == roomId)
        .ExecuteUpdateAsync(setters => setters.SetProperty(s => s.CurrentMessage, _ => message), ct);
    if (rows == 0) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);

    var state = await db.RoomTimerStates.AsNoTracking().FirstAsync(s => s.RoomId == roomId, ct);
    db.AuditLog.Add(new AuditLogEntry
    {
        Id = Guid.NewGuid(),
        TenantId = state.TenantId,
        RoomId = roomId,
        UserId = userId,
        Action = string.IsNullOrEmpty(message) ? "ClearMessage" : "SetMessage",
        DetailsJson = message is null ? "{}" : $"{{\"length\":{message.Length}}}",
        AtUtc = clock.UtcNow,
    });
    await db.SaveChangesAsync(ct);
    var snapshot = await GetSnapshotAsync(roomId, ct);
    return TimerOperationResult.Ok(snapshot!);
}
```

> Using `ExecuteUpdateAsync` writes the column without loading the row, so SQL Server doesn't bump `Version` (rowversion only changes when EF emits `UPDATE` against tracked entities). This implements the spec rule that messages don't invalidate concurrent state commands.

- [ ] **Step 2: Implement `StartAutoAsync` (operator auto-select)**

```csharp
public async Task<TimerOperationResult> StartAutoAsync(Guid roomId, long expectedVersion, Guid userId, CancellationToken ct)
{
    var (state, fail) = await LoadForCommandAsync(roomId, expectedVersion, ct);
    if (state is null) return TimerOperationResult.Fail(fail!.Value);

    // Pick the next item with no closed run; if all items have closed runs, pick the lowest-Position one without an open run.
    var now = clock.UtcNow;
    var candidate = await db.ScheduleItems
        .Where(s => s.RoomId == roomId
                    && !s.Runs.Any(r => r.EndedAtUtc != null)
                    && s.ScheduledStartUtc >= now.AddMinutes(-30))
        .OrderBy(s => s.Position)
        .Select(s => (Guid?)s.Id)
        .FirstOrDefaultAsync(ct);
    candidate ??= await db.ScheduleItems
        .Where(s => s.RoomId == roomId && !s.Runs.Any())
        .OrderBy(s => s.Position)
        .Select(s => (Guid?)s.Id)
        .FirstOrDefaultAsync(ct);
    if (candidate is null) return TimerOperationResult.Fail(TimerOperationOutcome.NoActiveItem);

    return await StartItemAsync(roomId, candidate.Value, RunTriggerKind.Operator, expectedVersion, userId, ct);
}
```

- [ ] **Step 3: Implement `ExpirePreRollAsync` (called by scheduler tick)**

```csharp
public async Task<TimerOperationResult> ExpirePreRollAsync(Guid roomId, CancellationToken ct)
{
    var state = await db.RoomTimerStates.Include(s => s.CurrentItem).FirstOrDefaultAsync(s => s.RoomId == roomId, ct);
    if (state is null) return TimerOperationResult.Fail(TimerOperationOutcome.NotFound);
    if (state.Phase != TimerPhase.PreRoll) return TimerOperationResult.Fail(TimerOperationOutcome.InvalidPhase);

    TimerStateMachine.ExpirePreRoll(state, clock.UtcNow);
    Audit(state, userId: null, "PreRollExpired", "{}");
    return await PersistAndReturnAsync(state, ct);
}
```

- [ ] **Step 4: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: SetMessage (unversioned), StartAuto (auto-select), ExpirePreRoll"
```

---

## Task 20: `IEmailSender` abstraction + `NoOpEmailSender`

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Email/IEmailSender.cs`
- Create: `src/EventStageTimer.Infrastructure/Email/NoOpEmailSender.cs`

Spec anchor: §8 synchronous email; §13 error handling.

- [ ] **Step 1: Define the interface and exception type**

Create `src/EventStageTimer.Infrastructure/Email/IEmailSender.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Email;

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken ct);
}

public sealed record EmailMessage(string To, string Subject, string BodyHtml, string BodyText);

public sealed class EmailSendException(string message, Exception? inner = null) : Exception(message, inner);
```

- [ ] **Step 2: Add a no-op implementation for tests and SMTP-less local mode**

Create `src/EventStageTimer.Infrastructure/Email/NoOpEmailSender.cs`:

```csharp
using Microsoft.Extensions.Logging;

namespace EventStageTimer.Infrastructure.Email;

public sealed class NoOpEmailSender(ILogger<NoOpEmailSender> log) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        log.LogInformation("[NoOpEmail] To={To} Subject={Subject}", message.To, message.Subject);
        return Task.CompletedTask;
    }
}
```

- [ ] **Step 3: Wire DI in `Program.cs` (default to no-op until SMTP is configured in T21)**

Add to `Program.cs`:

```csharp
builder.Services.AddSingleton<EventStageTimer.Infrastructure.Email.IEmailSender, EventStageTimer.Infrastructure.Email.NoOpEmailSender>();
```

- [ ] **Step 4: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: IEmailSender abstraction + NoOpEmailSender"
```

---

## Task 21: `SmtpEmailSender` via MailKit

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Email/SmtpEmailSender.cs`
- Create: `src/EventStageTimer.Infrastructure/Email/SmtpOptions.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`
- Modify: `src/EventStageTimer.Api/appsettings.json`

- [ ] **Step 1: Add the MailKit package to Infrastructure**

```bash
dotnet add src/EventStageTimer.Infrastructure/EventStageTimer.Infrastructure.csproj package MailKit
```

- [ ] **Step 2: Define options bound from `Smtp:*` config**

Create `src/EventStageTimer.Infrastructure/Email/SmtpOptions.cs`:

```csharp
namespace EventStageTimer.Infrastructure.Email;

public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public bool UseStartTls { get; set; } = true;
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "noreply@example.com";
    public string FromName { get; set; } = "Event Stage Timer";
    public int TimeoutMs { get; set; } = 10_000;
}
```

- [ ] **Step 3: Implement the sender**

Create `src/EventStageTimer.Infrastructure/Email/SmtpEmailSender.cs`:

```csharp
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace EventStageTimer.Infrastructure.Email;

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    private readonly SmtpOptions _o = options.Value;

    public async Task SendAsync(EmailMessage message, CancellationToken ct)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_o.FromName, _o.FromAddress));
        msg.To.Add(MailboxAddress.Parse(message.To));
        msg.Subject = message.Subject;
        msg.Body = new BodyBuilder { HtmlBody = message.BodyHtml, TextBody = message.BodyText }.ToMessageBody();

        using var smtp = new SmtpClient { Timeout = _o.TimeoutMs };
        try
        {
            var socketOpt = _o.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto;
            await smtp.ConnectAsync(_o.Host, _o.Port, socketOpt, ct);
            if (!string.IsNullOrEmpty(_o.Username))
                await smtp.AuthenticateAsync(_o.Username, _o.Password, ct);
            await smtp.SendAsync(msg, ct);
            await smtp.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "SMTP send to {To} failed", message.To);
            throw new EmailSendException("Failed to send email", ex);
        }
    }
}
```

- [ ] **Step 4: Wire SMTP if configured; otherwise stay on NoOp**

In `Program.cs` replace the `IEmailSender` registration block:

```csharp
builder.Services.Configure<EventStageTimer.Infrastructure.Email.SmtpOptions>(builder.Configuration.GetSection("Smtp"));
var smtpHost = builder.Configuration["Smtp:Host"];
if (!string.IsNullOrWhiteSpace(smtpHost))
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Email.IEmailSender, EventStageTimer.Infrastructure.Email.SmtpEmailSender>();
else
    builder.Services.AddSingleton<EventStageTimer.Infrastructure.Email.IEmailSender, EventStageTimer.Infrastructure.Email.NoOpEmailSender>();
```

Add a placeholder `Smtp` section to `appsettings.json`:

```json
"Smtp": {
  "Host": "",
  "Port": 587,
  "UseStartTls": true,
  "Username": "",
  "Password": "",
  "FromAddress": "noreply@example.com",
  "FromName": "Event Stage Timer"
}
```

- [ ] **Step 5: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: SmtpEmailSender via MailKit, used when Smtp:Host is configured"
```

---

## Task 22: `AccessCodeGenerator` service

**Files:**
- Create: `src/EventStageTimer.Infrastructure/Auth/AccessCodeGenerator.cs`
- Test: `tests/EventStageTimer.Domain.Tests/Common/AccessCodeGeneratorContractTests.cs`

> The `AccessCode` *value type* lives in Domain (T2). The *generator service* that retries on DB collisions lives in Infrastructure since it needs a `DbContext`.

- [ ] **Step 1: Define the generator service**

Create `src/EventStageTimer.Infrastructure/Auth/AccessCodeGenerator.cs`:

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Infrastructure.Auth;

public interface IAccessCodeGenerator
{
    Task<AccessCode> GenerateUniqueAsync(CancellationToken ct);
}

public sealed class AccessCodeGenerator(AppDbContext db) : IAccessCodeGenerator
{
    private const int MaxAttempts = 8;

    public async Task<AccessCode> GenerateUniqueAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var candidate = AccessCode.Generate();
            var taken = await db.Rooms.IgnoreQueryFilters().AnyAsync(r => r.AccessCode == candidate.Value, ct)
                     || await db.Events.IgnoreQueryFilters().AnyAsync(e => e.LobbyAccessCode == candidate.Value, ct);
            if (!taken) return candidate;
        }
        throw new InvalidOperationException($"Could not generate a unique access code after {MaxAttempts} attempts");
    }
}
```

- [ ] **Step 2: Register in DI**

Add to `Program.cs`:

```csharp
builder.Services.AddScoped<EventStageTimer.Infrastructure.Auth.IAccessCodeGenerator, EventStageTimer.Infrastructure.Auth.AccessCodeGenerator>();
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: AccessCodeGenerator service with DB-collision retry"
```

---

## Task 23: ASP.NET Core Identity setup

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Identity/IdentitySetup.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`
- Modify: `src/EventStageTimer.Api/appsettings.json`

Spec anchors: §9.1 auth modes, §9.2 cookie issuance.

- [ ] **Step 1: Create the setup helper**

Create `src/EventStageTimer.Api/Auth/Identity/IdentitySetup.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace EventStageTimer.Api.Auth.Identity;

public static class IdentitySetup
{
    public const string SchemeName = CookieAuthenticationDefaults.AuthenticationScheme;

    public static IServiceCollection AddAppIdentity(this IServiceCollection services, IConfiguration config)
    {
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
        .AddDefaultTokenProviders();

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
            });

        services.AddAuthorization();
        return services;
    }
}
```

- [ ] **Step 2: Wire into `Program.cs`**

Replace the existing `app.UseAuthentication(); app.UseAuthorization();` lines. Add before `var app = builder.Build();`:

```csharp
builder.Services.AddAppIdentity(builder.Configuration);
```

Confirm that the request pipeline contains, in order:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<EventStageTimer.Api.Middleware.TenantResolutionMiddleware>();
app.MapControllers();
```

- [ ] **Step 3: Add an `Auth:Mode` config setting**

Update `appsettings.json`:

```json
"Auth": {
  "Mode": "Password"   // "MagicLink" or "Password"
}
```

- [ ] **Step 4: Generate a follow-up migration if Identity tables changed**

```bash
dotnet ef migrations add AddIdentity \
  --project src/EventStageTimer.Infrastructure \
  --startup-project src/EventStageTimer.Api \
  --output-dir Persistence/Migrations
```

If the `Initial` migration already included the Identity tables (it should — `AppDbContext` extends `IdentityDbContext`), this will be a no-op migration; delete the empty migration files in that case.

- [ ] **Step 5: Build + smoke test**

```bash
dotnet build EventStageTimer.sln
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add . && git commit -m "feat: ASP.NET Core Identity setup with cookie auth (Lax, HttpOnly, Secure)"
```

---

## Task 24: `MagicLinkService` — issue + consume tokens

**Files:**
- Create: `src/EventStageTimer.Api/Auth/MagicLink/MagicLinkService.cs`

Spec anchors: §9.1 MagicLink flow, §13 synchronous email failure UX.

- [ ] **Step 1: Implement the service**

```csharp
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

        try
        {
            await email.SendAsync(new EmailMessage(
                emailAddress,
                "Sign in to Event Stage Timer",
                $"<p>Click to sign in: <a href=\"{link}\">{link}</a></p><p>The link expires in 15 minutes.</p>",
                $"Sign in: {link}\nExpires in 15 minutes."), ct);
        }
        catch (EmailSendException)
        {
            // Caller decides how to surface — controller maps to a 502 with a retry message.
            throw;
        }
        return token; // returned for tests; not sent to controllers
    }

    public async Task<User?> ConsumeAsync(string token, CancellationToken ct)
    {
        var link = await db.AuthMagicLinks.Include(l => l.User).FirstOrDefaultAsync(l => l.Token == token, ct);
        if (link is null) return null;
        if (link.UsedAt is not null) return null;
        if (link.ExpiresAt < clock.UtcNow) return null;
        link.UsedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return link.User;
    }
}
```

- [ ] **Step 2: Register in DI**

```csharp
builder.Services.AddScoped<EventStageTimer.Api.Auth.MagicLink.MagicLinkService>();
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: MagicLinkService — issue (single-use, 15 min) + consume"
```

---

## Task 25: `MagicLinkController` — request + consume endpoints

**Files:**
- Create: `src/EventStageTimer.Api/Auth/MagicLink/MagicLinkController.cs`

- [ ] **Step 1: Implement the controller**

```csharp
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Email;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.MagicLink;

[ApiController]
[Route("api/auth/magic-link")]
public sealed class MagicLinkController(MagicLinkService svc, UserManager<User> users) : ControllerBase
{
    public sealed record RequestBody(string Email);

    [HttpPost("request")]
    public async Task<IActionResult> Request([FromBody] RequestBody body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Email)) return BadRequest();
        if (await users.FindByEmailAsync(body.Email) is null)
            return Ok(new { sent = true }); // don't leak whether the email is registered

        try { await svc.IssueAsync(body.Email, ct); }
        catch (EmailSendException) { return StatusCode(502, new { error = "EmailSendFailed" }); }

        return Ok(new { sent = true });
    }

    [HttpGet("consume")]
    public async Task<IActionResult> Consume([FromQuery] string token, CancellationToken ct)
    {
        var user = await svc.ConsumeAsync(token, ct);
        if (user is null) return Unauthorized();

        var memberships = users.Users; // get tenant claim from primary tenant (first owner/admin)
        var primaryTenantId = await users.GetClaimsAsync(user); // placeholder — real lookup in T28
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
        };
        var identity = new ClaimsIdentity(claims, IdentitySetup.SchemeName);
        await HttpContext.SignInAsync(IdentitySetup.SchemeName, new ClaimsPrincipal(identity));
        return Ok(new { signedIn = true });
    }
}
```

> Note: the controller does *not* include a `tid` claim yet — that's added in T28 once we have the tenant-membership lookup wired.

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: MagicLinkController — request and consume endpoints"
```

---

## Task 26: `PasswordController` — local mode sign-in

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Password/PasswordController.cs`

- [ ] **Step 1: Implement the controller**

```csharp
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Entities;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Password;

[ApiController]
[Route("api/auth/password")]
public sealed class PasswordController(UserManager<User> users, SignInManager<User> signIn) : ControllerBase
{
    public sealed record SignInBody(string Email, string Password);

    [HttpPost("signin")]
    public async Task<IActionResult> SignIn([FromBody] SignInBody body, CancellationToken ct)
    {
        var user = await users.FindByEmailAsync(body.Email);
        if (user is null) return Unauthorized();

        var ok = await users.CheckPasswordAsync(user, body.Password);
        if (!ok) return Unauthorized();

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
        };
        var identity = new ClaimsIdentity(claims, IdentitySetup.SchemeName);
        await HttpContext.SignInAsync(IdentitySetup.SchemeName, new ClaimsPrincipal(identity));
        return Ok(new { signedIn = true });
    }

    [HttpPost("signout")]
    public async Task<IActionResult> SignOutEndpoint()
    {
        await HttpContext.SignOutAsync(IdentitySetup.SchemeName);
        return NoContent();
    }
}
```

- [ ] **Step 2: Wire `SignInManager` (it requires `IHttpContextAccessor`)**

In `IdentitySetup.AddAppIdentity`, after `AddIdentityCore`, append `.AddSignInManager()` and add `services.AddHttpContextAccessor();` above. Final block:

```csharp
services.AddHttpContextAccessor();

services.AddIdentityCore<User>(o => { /* … */ })
    .AddRoles<IdentityRole<Guid>>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders()
    .AddSignInManager();
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: PasswordController — sign-in/sign-out for local self-host mode"
```

---

## Task 27: `BootstrapController` — first-run setup for self-host

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Bootstrap/BootstrapController.cs`

Spec anchor: §9.3 bootstrap.

- [ ] **Step 1: Implement the controller**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Auth.Bootstrap;

[ApiController]
[Route("api/setup")]
public sealed class BootstrapController(
    AppDbContext db,
    UserManager<User> users,
    IClock clock) : ControllerBase
{
    public sealed record SetupBody(string TenantName, string TenantSlug, string OwnerEmail, string OwnerPassword, string OwnerDisplayName);

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var hasTenant = await db.Tenants.IgnoreQueryFilters().AnyAsync(ct);
        return Ok(new { initialized = hasTenant });
    }

    [HttpPost("initialize")]
    public async Task<IActionResult> Initialize([FromBody] SetupBody body, CancellationToken ct)
    {
        if (await db.Tenants.IgnoreQueryFilters().AnyAsync(ct))
            return Conflict(new { error = "AlreadyInitialized" });

        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = body.TenantName,
            Slug = body.TenantSlug,
            Mode = TenantMode.SelfHost,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Tenants.Add(tenant);

        var user = new User
        {
            Id = Guid.NewGuid(),
            UserName = body.OwnerEmail,
            Email = body.OwnerEmail,
            DisplayName = body.OwnerDisplayName,
            CreatedAtUtc = clock.UtcNow,
        };
        var createResult = await users.CreateAsync(user, body.OwnerPassword);
        if (!createResult.Succeeded) return BadRequest(new { errors = createResult.Errors });

        db.TenantMemberships.Add(new TenantMembership
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            UserId = user.Id,
            Role = TenantRole.Owner,
            CreatedAtUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return Ok(new { tenantId = tenant.Id, userId = user.Id });
    }
}
```

> The `IgnoreQueryFilters` calls bypass the multi-tenant filter for cross-tenant existence checks (the only place we do this without a system principal).

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: BootstrapController — first-run /setup endpoints (status + initialize)"
```

---

## Task 28: Tenant claim + memberships lookup at sign-in

**Files:**
- Modify: `src/EventStageTimer.Api/Auth/MagicLink/MagicLinkController.cs`
- Modify: `src/EventStageTimer.Api/Auth/Password/PasswordController.cs`
- Create: `src/EventStageTimer.Api/Auth/SignInHelper.cs`

Both controllers should attach the user's **primary tenant** as a `tid` claim so `TenantResolutionMiddleware` can populate `ITenantContext` for authenticated requests.

- [ ] **Step 1: Add a shared sign-in helper**

```csharp
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth;

public static class SignInHelper
{
    public static async Task SignInWithTenantAsync(HttpContext ctx, AppDbContext db, User user, CancellationToken ct)
    {
        var primaryTenantId = await db.TenantMemberships
            .IgnoreQueryFilters()
            .Where(tm => tm.UserId == user.Id)
            .OrderBy(tm => tm.Role) // Owner=1 < Admin=2
            .Select(tm => (Guid?)tm.TenantId)
            .FirstOrDefaultAsync(ct);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email!),
        };
        if (primaryTenantId is { } tid) claims.Add(new Claim("tid", tid.ToString()));

        var identity = new ClaimsIdentity(claims, IdentitySetup.SchemeName);
        await ctx.SignInAsync(IdentitySetup.SchemeName, new ClaimsPrincipal(identity));
    }
}
```

- [ ] **Step 2: Use the helper in both controllers**

Replace the `SignInAsync` calls in `MagicLinkController.Consume` and `PasswordController.SignIn` with:

```csharp
await SignInHelper.SignInWithTenantAsync(HttpContext, db, user, ct);
```

(Inject `AppDbContext db` into the constructors.)

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: emit tid claim from primary TenantMembership at sign-in"
```

---

## Task 29: `EventAccessRequirement` + handler

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Policies/EventAccessRequirement.cs`
- Create: `src/EventStageTimer.Api/Auth/Policies/EventAccessHandler.cs`
- Modify: `src/EventStageTimer.Api/Program.cs` (register policies)

Spec anchors: §9.2 authorization.

- [ ] **Step 1: Define the requirement**

Create `src/EventStageTimer.Api/Auth/Policies/EventAccessRequirement.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using Microsoft.AspNetCore.Authorization;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class EventAccessRequirement(EventRole minimumRole) : IAuthorizationRequirement
{
    public EventRole MinimumRole { get; } = minimumRole;
}
```

- [ ] **Step 2: Implement the handler**

Create `src/EventStageTimer.Api/Auth/Policies/EventAccessHandler.cs`:

```csharp
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class EventAccessHandler(AppDbContext db, IHttpContextAccessor http) : AuthorizationHandler<EventAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext ctx, EventAccessRequirement requirement)
    {
        var userIdClaim = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdClaim, out var userId)) return;

        var eventId = ResolveEventId(http.HttpContext);
        if (eventId is null) return;

        var membership = await db.EventMemberships
            .IgnoreQueryFilters()
            .Where(em => em.EventId == eventId && em.UserId == userId)
            .Select(em => (EventRole?)em.Role)
            .FirstOrDefaultAsync();

        if (membership is { } role && role <= requirement.MinimumRole)
            ctx.Succeed(requirement);
    }

    private static Guid? ResolveEventId(HttpContext? ctx)
    {
        if (ctx is null) return null;
        var route = ctx.GetRouteData();
        if (route.Values.TryGetValue("eventId", out var v) && Guid.TryParse(v?.ToString(), out var g)) return g;
        if (ctx.Request.Query.TryGetValue("eventId", out var qv) && Guid.TryParse(qv, out var qg)) return qg;
        return null;
    }
}
```

> `EventRole` is ordered numerically: `EventAdmin=1`, `RoomOperator=2`, `Viewer=3`. The check `role <= MinimumRole` means a user satisfies a `MinimumRole=Viewer` requirement with any of the three roles, but a `MinimumRole=EventAdmin` requirement only with `EventAdmin`.

- [ ] **Step 3: Register in DI and define named policies**

In `Program.cs`, after `AddAppIdentity`:

```csharp
builder.Services.AddScoped<IAuthorizationHandler, EventStageTimer.Api.Auth.Policies.EventAccessHandler>();
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("EventAdmin", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.EventAccessRequirement(EventStageTimer.Domain.Entities.EventRole.EventAdmin)))
    .AddPolicy("EventViewer", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.EventAccessRequirement(EventStageTimer.Domain.Entities.EventRole.Viewer)));
```

- [ ] **Step 4: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: EventAccessRequirement + handler + EventAdmin/EventViewer policies"
```

---

## Task 30: `RoomAccessRequirement` + handler

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Policies/RoomAccessRequirement.cs`
- Create: `src/EventStageTimer.Api/Auth/Policies/RoomAccessHandler.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`

Spec anchor: §9.2.

- [ ] **Step 1: Define the requirement**

```csharp
using EventStageTimer.Domain.Entities;
using Microsoft.AspNetCore.Authorization;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class RoomAccessRequirement(EventRole minimumRole) : IAuthorizationRequirement
{
    public EventRole MinimumRole { get; } = minimumRole;
}
```

- [ ] **Step 2: Implement the handler — joins through `EventMembershipRoom` for `RoomOperator`**

```csharp
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Auth.Policies;

public sealed class RoomAccessHandler(AppDbContext db, IHttpContextAccessor http) : AuthorizationHandler<RoomAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext ctx, RoomAccessRequirement requirement)
    {
        var userIdClaim = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdClaim, out var userId)) return;

        var roomId = ResolveRoomId(http.HttpContext);
        if (roomId is null) return;

        var room = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.Id == roomId)
            .Select(r => new { r.Id, r.EventId, r.TenantId })
            .FirstOrDefaultAsync();
        if (room is null) return;

        var membership = await db.EventMemberships
            .IgnoreQueryFilters()
            .Where(em => em.EventId == room.EventId && em.UserId == userId)
            .Select(em => new { em.Id, em.Role })
            .FirstOrDefaultAsync();
        if (membership is null) return;

        if (membership.Role > requirement.MinimumRole) return; // not high enough

        if (membership.Role == EventRole.RoomOperator)
        {
            // Must be in scoped rooms
            var inScope = await db.EventMembershipRooms
                .IgnoreQueryFilters()
                .AnyAsync(emr => emr.EventMembershipId == membership.Id && emr.RoomId == room.Id);
            if (!inScope) return;
        }

        ctx.Succeed(requirement);
    }

    private static Guid? ResolveRoomId(HttpContext? ctx)
    {
        if (ctx is null) return null;
        var route = ctx.GetRouteData();
        if (route.Values.TryGetValue("roomId", out var v) && Guid.TryParse(v?.ToString(), out var g)) return g;
        if (ctx.Request.Query.TryGetValue("roomId", out var qv) && Guid.TryParse(qv, out var qg)) return qg;
        return null;
    }
}
```

- [ ] **Step 3: Register policy**

In `Program.cs`:

```csharp
builder.Services.AddScoped<IAuthorizationHandler, EventStageTimer.Api.Auth.Policies.RoomAccessHandler>();
// Extend the AddAuthorizationBuilder chain:
//   .AddPolicy("RoomOperator", p => p.AddRequirements(new EventStageTimer.Api.Auth.Policies.RoomAccessRequirement(EventStageTimer.Domain.Entities.EventRole.RoomOperator)))
```

- [ ] **Step 4: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: RoomAccessRequirement + handler with EventMembershipRoom scope check"
```

---

## Task 31: Public access-code authentication scheme

**Files:**
- Create: `src/EventStageTimer.Api/Auth/Public/PublicAccessCodeAuthOptions.cs`
- Create: `src/EventStageTimer.Api/Auth/Public/PublicAccessCodeAuthHandler.cs`
- Create: `src/EventStageTimer.Api/Auth/Public/PublicAccessContext.cs`
- Modify: `src/EventStageTimer.Api/Auth/Identity/IdentitySetup.cs`

Spec anchors: §7 hub auth, §9.2 public scheme.

- [ ] **Step 1: Define the auth scheme options**

```csharp
using Microsoft.AspNetCore.Authentication;

namespace EventStageTimer.Api.Auth.Public;

public sealed class PublicAccessCodeAuthOptions : AuthenticationSchemeOptions { }
```

- [ ] **Step 2: Add a per-request public access context (room + tenant resolved from code)**

```csharp
namespace EventStageTimer.Api.Auth.Public;

public sealed class PublicAccessContext
{
    public Guid? TenantId { get; set; }
    public Guid? RoomId { get; set; }
    public Guid? EventId { get; set; }
    public string? AccessCode { get; set; }
    public bool IsLobbyCode { get; set; }
}
```

- [ ] **Step 3: Implement the handler**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace EventStageTimer.Api.Auth.Public;

public sealed class PublicAccessCodeAuthHandler(
    IOptionsMonitor<PublicAccessCodeAuthOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    AppDbContext db,
    PublicAccessContext context,
    ITenantContext tenantContext)
    : AuthenticationHandler<PublicAccessCodeAuthOptions>(options, logger, encoder)
{
    public const string SchemeName = "PublicAccessCode";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Code lives in the path: /r/{code}/... or /e/{code}/lobby
        var path = Request.Path.Value ?? "";
        string? raw = null;
        bool isLobby = false;
        if (path.StartsWith("/r/", StringComparison.Ordinal)) { raw = ExtractSegment(path, 3); }
        else if (path.StartsWith("/e/", StringComparison.Ordinal)) { raw = ExtractSegment(path, 3); isLobby = true; }
        // Hub negotiate: code is in querystring "?code="
        if (raw is null && Request.Query.TryGetValue("code", out var q)) raw = q.ToString();

        if (raw is null || !AccessCode.TryParse(raw, out var code))
            return AuthenticateResult.NoResult();

        if (isLobby)
        {
            var ev = await db.Events.IgnoreQueryFilters()
                .Where(e => e.LobbyAccessCode == code.Value)
                .Select(e => new { e.Id, e.TenantId })
                .FirstOrDefaultAsync();
            if (ev is null) return AuthenticateResult.Fail("Invalid code");
            context.AccessCode = code.Value;
            context.EventId = ev.Id;
            context.TenantId = ev.TenantId;
            context.IsLobbyCode = true;
        }
        else
        {
            var room = await db.Rooms.IgnoreQueryFilters()
                .Where(r => r.AccessCode == code.Value)
                .Select(r => new { r.Id, r.EventId, r.TenantId })
                .FirstOrDefaultAsync();
            if (room is null) return AuthenticateResult.Fail("Invalid code");
            context.AccessCode = code.Value;
            context.RoomId = room.Id;
            context.EventId = room.EventId;
            context.TenantId = room.TenantId;
        }

        if (context.TenantId is { } tid) tenantContext.Set(tid);

        var claims = new List<Claim>
        {
            new("acl", code.Value),
            new("scope", isLobby ? "lobby" : "room"),
        };
        if (context.RoomId is { } rid) claims.Add(new Claim("rid", rid.ToString()));
        if (context.EventId is { } eid) claims.Add(new Claim("eid", eid.ToString()));
        if (context.TenantId is { } tid2) claims.Add(new Claim("tid", tid2.ToString()));

        var identity = new ClaimsIdentity(claims, SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    private static string? ExtractSegment(string path, int startIndex)
    {
        var rest = path[startIndex..];
        var slash = rest.IndexOf('/');
        return slash < 0 ? rest : rest[..slash];
    }
}
```

- [ ] **Step 4: Register the scheme**

In `IdentitySetup.AddAppIdentity`, change `services.AddAuthentication(SchemeName).AddCookie(...)` to add the public scheme:

```csharp
services.AddScoped<EventStageTimer.Api.Auth.Public.PublicAccessContext>();

services.AddAuthentication(SchemeName)
    .AddCookie(SchemeName, opts => { /* unchanged */ })
    .AddScheme<EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthOptions, EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler>(
        EventStageTimer.Api.Auth.Public.PublicAccessCodeAuthHandler.SchemeName, _ => { });
```

- [ ] **Step 5: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: PublicAccessCode auth scheme with PublicAccessContext"
```

---

## Task 32: `PublicRateLimitMiddleware`

**Files:**
- Create: `src/EventStageTimer.Api/Middleware/PublicRateLimitMiddleware.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`
- Modify: `src/EventStageTimer.Api/appsettings.json`

Spec anchor: §11 rate limiting (10 req/sec per IP, 30-burst).

- [ ] **Step 1: Implement the middleware using ASP.NET Core's `RateLimiting` package shape**

```csharp
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
```

- [ ] **Step 2: Register and configure**

In `Program.cs`:

```csharp
builder.Services.Configure<EventStageTimer.Api.Middleware.PublicRateLimitOptions>(builder.Configuration.GetSection("Security:PublicRateLimit"));
```

In the request pipeline, before `UseAuthentication`:

```csharp
app.UseMiddleware<EventStageTimer.Api.Middleware.PublicRateLimitMiddleware>();
```

`appsettings.json` — add:

```json
"Security": {
  "PublicRateLimit": {
    "RequestsPerSecond": 10,
    "BurstSize": 30,
    "CooldownSeconds": 60
  }
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: PublicRateLimitMiddleware (token bucket per IP) for /r, /e, hub negotiate"
```

---

## Task 33: `EventsController` — CRUD on events

**Files:**
- Create: `src/EventStageTimer.Api/Controllers/EventsController.cs`

- [ ] **Step 1: Implement the controller (require `EventAdmin` for mutations, authenticated for reads)**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize] // cookie-authenticated — TenantContext already set by middleware
[Route("api/events")]
public sealed class EventsController(AppDbContext db, IClock clock, IAccessCodeGenerator codes) : ControllerBase
{
    public sealed record EventDto(Guid Id, string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc, string LobbyAccessCode);
    public sealed record CreateBody(string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc);
    public sealed record UpdateBody(string Name, string TimeZone, DateTime StartsAtUtc, DateTime EndsAtUtc);

    [HttpGet]
    public async Task<IReadOnlyList<EventDto>> List(CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return await db.Events
            .Where(e => e.Memberships.Any(m => m.UserId == userId))
            .Select(e => new EventDto(e.Id, e.Name, e.TimeZone, e.StartsAtUtc, e.EndsAtUtc, e.LobbyAccessCode))
            .ToListAsync(ct);
    }

    [HttpGet("{eventId:guid}")]
    [Authorize(Policy = "EventViewer")]
    public async Task<ActionResult<EventDto>> Get(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events
            .Where(e => e.Id == eventId)
            .Select(e => new EventDto(e.Id, e.Name, e.TimeZone, e.StartsAtUtc, e.EndsAtUtc, e.LobbyAccessCode))
            .FirstOrDefaultAsync(ct);
        return ev is null ? NotFound() : Ok(ev);
    }

    [HttpPost]
    public async Task<ActionResult<EventDto>> Create([FromBody] CreateBody body, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var tenantId = Guid.Parse(User.FindFirstValue("tid")!);
        var lobbyCode = await codes.GenerateUniqueAsync(ct);

        var ev = new Event
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = body.Name,
            TimeZone = body.TimeZone,
            StartsAtUtc = body.StartsAtUtc,
            EndsAtUtc = body.EndsAtUtc,
            LobbyAccessCode = lobbyCode.Value,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Events.Add(ev);

        // The creator becomes EventAdmin
        db.EventMemberships.Add(new EventMembership
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            EventId = ev.Id,
            UserId = userId,
            Role = EventRole.EventAdmin,
            CreatedAtUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { eventId = ev.Id }, new EventDto(ev.Id, ev.Name, ev.TimeZone, ev.StartsAtUtc, ev.EndsAtUtc, ev.LobbyAccessCode));
    }

    [HttpPut("{eventId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.Name = body.Name;
        ev.TimeZone = body.TimeZone;
        ev.StartsAtUtc = body.StartsAtUtc;
        ev.EndsAtUtc = body.EndsAtUtc;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{eventId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        ev.DeletedAtUtc = clock.UtcNow; // soft delete
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: EventsController — CRUD with EventAdmin policy on mutations"
```

---

## Task 34: `RoomsController` — CRUD + access-code regeneration

**Files:**
- Create: `src/EventStageTimer.Api/Controllers/RoomsController.cs`

- [ ] **Step 1: Implement the controller**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events/{eventId:guid}/rooms")]
public sealed class RoomsController(AppDbContext db, IClock clock, IAccessCodeGenerator codes) : ControllerBase
{
    public sealed record RoomDto(Guid Id, Guid EventId, string Name, string AccessCode, int DefaultPreRollSec);
    public sealed record CreateBody(string Name, int DefaultPreRollSec = 30);
    public sealed record UpdateBody(string Name, int DefaultPreRollSec);

    [HttpGet]
    [Authorize(Policy = "EventViewer")]
    public async Task<IReadOnlyList<RoomDto>> List(Guid eventId, CancellationToken ct) =>
        await db.Rooms
            .Where(r => r.EventId == eventId)
            .Select(r => new RoomDto(r.Id, r.EventId, r.Name, r.AccessCode, r.DefaultPreRollSec))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<RoomDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var code = await codes.GenerateUniqueAsync(ct);
        var room = new Room
        {
            Id = Guid.NewGuid(),
            TenantId = ev.TenantId,
            EventId = eventId,
            Name = body.Name,
            AccessCode = code.Value,
            DefaultPreRollSec = body.DefaultPreRollSec,
            CreatedAtUtc = clock.UtcNow,
        };
        db.Rooms.Add(room);
        // Initialize timer state
        db.RoomTimerStates.Add(new RoomTimerState
        {
            RoomId = room.Id,
            TenantId = ev.TenantId,
            Phase = TimerPhase.Idle,
        });
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new { eventId }, new RoomDto(room.Id, room.EventId, room.Name, room.AccessCode, room.DefaultPreRollSec));
    }

    [HttpPut("{roomId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, Guid roomId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        room.Name = body.Name;
        room.DefaultPreRollSec = body.DefaultPreRollSec;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("{roomId:guid}/regenerate-access-code")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<RoomDto>> RegenerateAccessCode(Guid eventId, Guid roomId, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        var newCode = await codes.GenerateUniqueAsync(ct);
        room.AccessCode = newCode.Value;
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(), TenantId = room.TenantId,
            EventId = eventId, RoomId = roomId,
            Action = "RegenerateAccessCode", DetailsJson = "{}", AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
        return Ok(new RoomDto(room.Id, room.EventId, room.Name, room.AccessCode, room.DefaultPreRollSec));
    }

    [HttpDelete("{roomId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, Guid roomId, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId && r.EventId == eventId, ct);
        if (room is null) return NotFound();
        room.DeletedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: RoomsController — CRUD + AccessCode regeneration with audit"
```

---

## Task 35: `ScheduleItemsController` — CRUD + reorder

**Files:**
- Create: `src/EventStageTimer.Api/Controllers/ScheduleItemsController.cs`

- [ ] **Step 1: Implement the controller**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(Policy = "EventViewer")]
[Route("api/rooms/{roomId:guid}/schedule")]
public sealed class ScheduleItemsController(AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record ScheduleItemDto(Guid Id, int Position, string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record CreateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record UpdateBody(string Title, string? SpeakerName, DateTime ScheduledStartUtc, int DurationSec, int PreRollSec, bool AutoStart, string? ThresholdsJson);
    public sealed record ReorderBody(IReadOnlyList<Guid> ItemIdsInOrder);

    [HttpGet]
    public async Task<IReadOnlyList<ScheduleItemDto>> List(Guid roomId, CancellationToken ct) =>
        await db.ScheduleItems
            .Where(s => s.RoomId == roomId)
            .OrderBy(s => s.Position)
            .Select(s => new ScheduleItemDto(s.Id, s.Position, s.Title, s.SpeakerName, s.ScheduledStartUtc, s.DurationSec, s.PreRollSec, s.AutoStart, s.ThresholdsJson))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<ScheduleItemDto>> Create(Guid roomId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId, ct);
        if (room is null) return NotFound();
        var maxPos = await db.ScheduleItems.Where(s => s.RoomId == roomId).Select(s => (int?)s.Position).MaxAsync(ct) ?? 0;
        var item = new ScheduleItem
        {
            Id = Guid.NewGuid(),
            TenantId = room.TenantId,
            RoomId = roomId,
            Position = maxPos + 1,
            Title = body.Title,
            SpeakerName = body.SpeakerName,
            ScheduledStartUtc = body.ScheduledStartUtc,
            DurationSec = body.DurationSec,
            PreRollSec = body.PreRollSec,
            AutoStart = body.AutoStart,
            ThresholdsJson = body.ThresholdsJson,
            CreatedAtUtc = clock.UtcNow,
        };
        db.ScheduleItems.Add(item);
        await db.SaveChangesAsync(ct);
        return Ok(new ScheduleItemDto(item.Id, item.Position, item.Title, item.SpeakerName, item.ScheduledStartUtc, item.DurationSec, item.PreRollSec, item.AutoStart, item.ThresholdsJson));
    }

    [HttpPut("{itemId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid roomId, Guid itemId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == itemId && s.RoomId == roomId, ct);
        if (item is null) return NotFound();
        item.Title = body.Title;
        item.SpeakerName = body.SpeakerName;
        item.ScheduledStartUtc = body.ScheduledStartUtc;
        item.DurationSec = body.DurationSec;
        item.PreRollSec = body.PreRollSec;
        item.AutoStart = body.AutoStart;
        item.ThresholdsJson = body.ThresholdsJson;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("reorder")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Reorder(Guid roomId, [FromBody] ReorderBody body, CancellationToken ct)
    {
        var items = await db.ScheduleItems.Where(s => s.RoomId == roomId).ToListAsync(ct);
        var byId = items.ToDictionary(i => i.Id);
        for (var i = 0; i < body.ItemIdsInOrder.Count; i++)
            if (byId.TryGetValue(body.ItemIdsInOrder[i], out var item))
                item.Position = i + 1;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{itemId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid roomId, Guid itemId, CancellationToken ct)
    {
        var item = await db.ScheduleItems.FirstOrDefaultAsync(s => s.Id == itemId && s.RoomId == roomId, ct);
        if (item is null) return NotFound();
        item.DeletedAtUtc = clock.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: ScheduleItemsController — CRUD with positional reorder"
```

---

## Task 36: `TimerHub` — connection setup, groups, auth scheme

**Files:**
- Create: `src/EventStageTimer.Api/Hubs/TimerHub.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`

Spec anchors: §7 hubs/groups, §9.2 dual auth schemes.

- [ ] **Step 1: Define a constants helper for group names**

In `src/EventStageTimer.Api/Hubs/TimerHub.cs`:

```csharp
using EventStageTimer.Api.Auth.Identity;
using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Timer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace EventStageTimer.Api.Hubs;

internal static class HubGroups
{
    public static string Room(Guid roomId) => $"room:{roomId}";
    public static string EventLobby(Guid eventId) => $"event-lobby:{eventId}";
    public static string EventControl(Guid eventId) => $"event-control:{eventId}";
}

[Authorize(AuthenticationSchemes = IdentitySetup.SchemeName + "," + PublicAccessCodeAuthHandler.SchemeName)]
public sealed partial class TimerHub(
    AppDbContext db,
    ITimerCommandService commands,
    PublicAccessContext publicCtx,
    IClock clock) : Hub
{
    public override async Task OnConnectedAsync()
    {
        // Authenticated operator: join groups for any rooms in their accessible events.
        var userIdClaim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdClaim, out var userId))
        {
            var accessibleRoomIds = await db.Rooms
                .Where(r => r.Event.Memberships.Any(m => m.UserId == userId))
                .Select(r => new { r.Id, r.EventId })
                .ToListAsync();
            foreach (var r in accessibleRoomIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Room(r.Id));
                await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.EventControl(r.EventId));
            }
        }

        // Public client: join based on access code scope
        if (publicCtx.RoomId is { } pubRoom)
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Room(pubRoom));
        if (publicCtx.IsLobbyCode && publicCtx.EventId is { } pubEvent)
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.EventLobby(pubEvent));

        await base.OnConnectedAsync();
    }
}
```

- [ ] **Step 2: Map the hub in `Program.cs`**

```csharp
app.MapHub<EventStageTimer.Api.Hubs.TimerHub>("/hub/timer");
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: TimerHub skeleton with group joins for both authenticated and public clients"
```

---

## Task 37: `TimerHub` — `Resync` snapshot method

**Files:**
- Modify: `src/EventStageTimer.Api/Hubs/TimerHub.cs`

Spec anchor: §6.4 snapshot payload, §13 reconnect path.

- [ ] **Step 1: Add the `Resync` method to the hub**

Append a partial class definition in the same file:

```csharp
public partial class TimerHub
{
    /// <summary>Returns the current snapshot for a room. Authorisation: caller must be in the room's group (joined on connect).</summary>
    public async Task<Snapshot?> Resync(Guid roomId)
    {
        // Verify caller belongs to the room group for this connection
        // (membership was set in OnConnectedAsync). For belt-and-braces, also reject if neither claim matches.
        var canSee = (publicCtx.RoomId == roomId)
                  || (Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) is { } uid
                      && Guid.TryParse(uid, out var userId)
                      && await db.Rooms.AnyAsync(r => r.Id == roomId && r.Event.Memberships.Any(m => m.UserId == userId)));
        if (!canSee) throw new HubException("Forbidden");

        return await commands.GetSnapshotAsync(roomId, Context.ConnectionAborted);
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: TimerHub.Resync — fetch current snapshot for any room the caller can see"
```

---

## Task 38: `TimerHub` — versioned state-changing methods

**Files:**
- Modify: `src/EventStageTimer.Api/Hubs/TimerHub.cs`

Spec anchor: §7 client→server methods.

- [ ] **Step 1: Add a helper to extract the operator user id and reject public callers**

```csharp
public partial class TimerHub
{
    private Guid RequireOperator()
    {
        var uid = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(uid, out var userId))
            throw new HubException("Forbidden: operator authentication required");
        return userId;
    }

    private async Task<Snapshot> InvokeAsync(Func<Task<TimerOperationResult>> command, Guid roomId)
    {
        var result = await command();
        if (!result.IsSuccess)
            throw new HubException($"{result.Outcome}");
        var snapshot = result.Snapshot!;
        await Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snapshot);
        // Lobby + control listeners get the same snapshot
        var eventId = await db.Rooms.Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync();
        await Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snapshot);
        await Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snapshot);
        return snapshot;
    }
}
```

- [ ] **Step 2: Add the versioned methods**

```csharp
public partial class TimerHub
{
    public Task<Snapshot> StartAuto(Guid roomId, long version) =>
        InvokeAsync(() => commands.StartAutoAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> StartItem(Guid roomId, Guid scheduleItemId, long version) =>
        InvokeAsync(() => commands.StartItemAsync(roomId, scheduleItemId, RunTriggerKind.Operator, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Pause(Guid roomId, long version) =>
        InvokeAsync(() => commands.PauseAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Resume(Guid roomId, long version) =>
        InvokeAsync(() => commands.ResumeAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Stop(Guid roomId, long version) =>
        InvokeAsync(() => commands.StopAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> Reset(Guid roomId, long version) =>
        InvokeAsync(() => commands.ResetAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> SkipNext(Guid roomId, long version) =>
        InvokeAsync(() => commands.SkipNextAsync(roomId, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> AdjustTime(Guid roomId, int deltaSec, long version) =>
        InvokeAsync(() => commands.AdjustTimeAsync(roomId, deltaSec, version, RequireOperator(), Context.ConnectionAborted), roomId);

    public Task<Snapshot> SetExactRemaining(Guid roomId, int remainingSec, long version) =>
        InvokeAsync(() => commands.SetExactRemainingAsync(roomId, remainingSec, version, RequireOperator(), Context.ConnectionAborted), roomId);
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: TimerHub versioned state-changing methods with broadcast"
```

---

## Task 39: `TimerHub` — unversioned message methods

**Files:**
- Modify: `src/EventStageTimer.Api/Hubs/TimerHub.cs`

Spec anchor: §4.5 SetMessage last-write-wins.

- [ ] **Step 1: Add `SetMessage` and `ClearMessage`**

```csharp
public partial class TimerHub
{
    public async Task<Snapshot> SetMessage(Guid roomId, string? message)
    {
        var userId = RequireOperator();
        var result = await commands.SetMessageAsync(roomId, message, userId, Context.ConnectionAborted);
        if (!result.IsSuccess) throw new HubException($"{result.Outcome}");
        await Clients.Group(HubGroups.Room(roomId)).SendAsync("MessageChanged", new { roomId, message });
        return result.Snapshot!;
    }

    public Task<Snapshot> ClearMessage(Guid roomId) => SetMessage(roomId, null);
}
```

> Note: `MessageChanged` is the dedicated event so clients can update the overlay without a full snapshot replacement. The full snapshot is still returned to the caller.

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: TimerHub SetMessage/ClearMessage (unversioned, MessageChanged broadcast)"
```

---

## Task 40: `TimerHub` — public client connect via access code

**Files:**
- Modify: `src/EventStageTimer.Api/Program.cs`
- Modify: `src/EventStageTimer.Api/Hubs/TimerHub.cs`

Spec anchor: §11 access code in URL/query for hub clients.

- [ ] **Step 1: Allow the hub negotiation to read the access code from the query string**

In `Program.cs`, add a SignalR options block near `AddSignalR()`:

```csharp
builder.Services.AddSignalR();
builder.Services.AddOptions<Microsoft.AspNetCore.Authentication.AuthenticationOptions>();
```

Update the `AddCookie` block in `IdentitySetup.AddAppIdentity` so cookie auth runs against `/hub/timer` correctly (cookies travel automatically; no change needed there).

For the public scheme, `PublicAccessCodeAuthHandler` already extracts the code from `?code=...` (T31, Step 3). Verify this branch covers `/hub/timer/negotiate?code=ABCD2345`.

- [ ] **Step 2: Initial-snapshot delivery to public clients on connect**

In `TimerHub.OnConnectedAsync`, after group joins, push the initial snapshot to the connecting client:

```csharp
if (publicCtx.RoomId is { } pr)
{
    var snap = await commands.GetSnapshotAsync(pr, Context.ConnectionAborted);
    if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
}
if (publicCtx.IsLobbyCode && publicCtx.EventId is { } pe)
{
    var lobbyRooms = await db.Rooms.Where(r => r.EventId == pe).Select(r => r.Id).ToListAsync();
    foreach (var rid in lobbyRooms)
    {
        var snap = await commands.GetSnapshotAsync(rid, Context.ConnectionAborted);
        if (snap is not null) await Clients.Caller.SendAsync("RoomStateChanged", snap);
    }
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: TimerHub public client connect — push initial snapshot(s) on join"
```

---

## Task 41: `SchedulerService` background loop

**Files:**
- Create: `src/EventStageTimer.Api/BackgroundServices/SchedulerService.cs`
- Modify: `src/EventStageTimer.Api/Program.cs`

Spec anchor: §4.6, §8.

- [ ] **Step 1: Implement the scheduler**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using EventStageTimer.Infrastructure.Timer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using EventStageTimer.Api.Hubs;

namespace EventStageTimer.Api.BackgroundServices;

public sealed class SchedulerService(
    IServiceScopeFactory scopes,
    IClock clock,
    ILogger<SchedulerService> log,
    IHubContext<TimerHub> hub) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        log.LogInformation("SchedulerService started");
        var period = TimeSpan.FromSeconds(1);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex) { log.LogWarning(ex, "Scheduler tick failed"); }
            try { await Task.Delay(period, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var commands = scope.ServiceProvider.GetRequiredService<ITimerCommandService>();
        var nowUtc = clock.UtcNow;

        // 1. Auto-start due items (pre-roll start)
        var dueItems = await db.ScheduleItems
            .IgnoreQueryFilters() // system scope across tenants
            .Include(s => s.Room).ThenInclude(r => r.TimerState)
            .Where(s => s.AutoStart
                     && s.Room.TimerState!.Phase == TimerPhase.Idle
                     && s.ScheduledStartUtc.AddSeconds(-s.PreRollSec) <= nowUtc
                     && !s.Runs.Any())
            .ToListAsync(ct);

        foreach (var item in dueItems)
        {
            log.LogInformation("Auto-starting item {ItemId} in room {RoomId}", item.Id, item.RoomId);
            var version = BitConverter.ToInt64(item.Room.TimerState!.Version, 0);
            var result = await commands.StartItemAsync(item.RoomId, item.Id, RunTriggerKind.Scheduler, version, userId: null, ct);
            if (result.IsSuccess && result.Snapshot is not null)
                await BroadcastAsync(db, item.RoomId, result.Snapshot, ct);
        }

        // 2. Expire pre-rolls
        var expired = await db.RoomTimerStates
            .IgnoreQueryFilters()
            .Where(s => s.Phase == TimerPhase.PreRoll && s.PreRollEndsAtUtc != null && s.PreRollEndsAtUtc <= nowUtc)
            .Select(s => s.RoomId)
            .ToListAsync(ct);

        foreach (var roomId in expired)
        {
            var result = await commands.ExpirePreRollAsync(roomId, ct);
            if (result.IsSuccess && result.Snapshot is not null)
                await BroadcastAsync(db, roomId, result.Snapshot, ct);
        }
    }

    private async Task BroadcastAsync(AppDbContext db, Guid roomId, EventStageTimer.Domain.Timer.Snapshot snap, CancellationToken ct)
    {
        await hub.Clients.Group(HubGroups.Room(roomId)).SendAsync("RoomStateChanged", snap, ct);
        var eventId = await db.Rooms.IgnoreQueryFilters().Where(r => r.Id == roomId).Select(r => r.EventId).FirstAsync(ct);
        await hub.Clients.Group(HubGroups.EventLobby(eventId)).SendAsync("RoomStateChanged", snap, ct);
        await hub.Clients.Group(HubGroups.EventControl(eventId)).SendAsync("RoomStateChanged", snap, ct);
    }
}
```

- [ ] **Step 2: Register**

```csharp
builder.Services.AddHostedService<EventStageTimer.Api.BackgroundServices.SchedulerService>();
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: SchedulerService — 1Hz auto-start + pre-roll expiry, broadcast via hub"
```

---

## Task 42: `AuditWriter` helper

**Files:**
- Create: `src/EventStageTimer.Api/Audit/AuditWriter.cs`

> The command service already writes audit rows inline. Some non-timer flows (regenerate access code, invitations, schedule edits) should also produce audit. Centralise the helper so callers don't repeat the field set.

- [ ] **Step 1: Implement**

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;

namespace EventStageTimer.Api.Audit;

public interface IAuditWriter
{
    Task WriteAsync(string action, Guid? userId, Guid tenantId, Guid? eventId, Guid? roomId, string detailsJson, CancellationToken ct);
}

public sealed class AuditWriter(AppDbContext db, IClock clock) : IAuditWriter
{
    public async Task WriteAsync(string action, Guid? userId, Guid tenantId, Guid? eventId, Guid? roomId, string detailsJson, CancellationToken ct)
    {
        db.AuditLog.Add(new AuditLogEntry
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            EventId = eventId,
            RoomId = roomId,
            UserId = userId,
            Action = action,
            DetailsJson = detailsJson,
            AtUtc = clock.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }
}
```

- [ ] **Step 2: Register**

```csharp
builder.Services.AddScoped<EventStageTimer.Api.Audit.IAuditWriter, EventStageTimer.Api.Audit.AuditWriter>();
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add . && git commit -m "feat: IAuditWriter helper for non-timer audit entries"
```

---

## Task 43: Test fixture — Testcontainers SQL Server + `TestApiFactory`

**Files:**
- Modify: `tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj`
- Create: `tests/EventStageTimer.Api.Tests/Fixtures/SqlServerFixture.cs`
- Create: `tests/EventStageTimer.Api.Tests/Fixtures/TestApiFactory.cs`

- [ ] **Step 1: Add the test packages**

```bash
dotnet add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj package Microsoft.AspNetCore.Mvc.Testing
dotnet add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj package Microsoft.AspNetCore.SignalR.Client
dotnet add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj package Testcontainers.MsSql
dotnet add tests/EventStageTimer.Api.Tests/EventStageTimer.Api.Tests.csproj package FluentAssertions
```

- [ ] **Step 2: Create the SQL Server fixture (per-test-collection container)**

Create `tests/EventStageTimer.Api.Tests/Fixtures/SqlServerFixture.cs`:

```csharp
using Testcontainers.MsSql;
using Xunit;

namespace EventStageTimer.Api.Tests.Fixtures;

public sealed class SqlServerFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder()
        .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
        .WithPassword("Strong_Test_P@ss_123")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync() => await _container.StartAsync();
    public async Task DisposeAsync() => await _container.DisposeAsync();
}

[CollectionDefinition("sqlserver")]
public sealed class SqlServerCollection : ICollectionFixture<SqlServerFixture> { }
```

- [ ] **Step 3: Create `TestApiFactory` that overrides the connection string and replaces `IClock` with `TestClock`**

Create `tests/EventStageTimer.Api.Tests/Fixtures/TestApiFactory.cs`:

```csharp
using EventStageTimer.Domain.Common;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EventStageTimer.Api.Tests.Fixtures;

public sealed class TestApiFactory(SqlServerFixture sql) : WebApplicationFactory<Program>
{
    public TestClock Clock { get; } = new(new DateTime(2026, 5, 10, 14, 0, 0, DateTimeKind.Utc));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, cfg) =>
        {
            cfg.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = sql.ConnectionString,
                ["Database:AutoMigrate"] = "true",
                ["Auth:Mode"] = "Password",
                ["App:BaseUrl"] = "http://localhost",
            });
        });

        builder.ConfigureServices(services =>
        {
            // Replace IClock with the deterministic test clock
            var clockDescriptor = services.Single(s => s.ServiceType == typeof(IClock));
            services.Remove(clockDescriptor);
            services.AddSingleton<IClock>(Clock);

            // Reset DB schema once per factory instance
            using var scope = services.BuildServiceProvider().CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Database.EnsureDeleted();
            db.Database.Migrate();
        });
    }
}
```

- [ ] **Step 4: Build (test project might fail until `TestClock` exists — that's T44)**

```bash
dotnet build tests/EventStageTimer.Api.Tests
```

If `TestClock` is not yet created, expect the failure at that symbol — fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "test: SqlServerFixture (Testcontainers) + TestApiFactory skeleton"
```

---

## Task 44: `TestClock` and `AuthHelpers`

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Fixtures/TestClock.cs`
- Create: `tests/EventStageTimer.Api.Tests/Fixtures/AuthHelpers.cs`

- [ ] **Step 1: Implement `TestClock`**

```csharp
using EventStageTimer.Domain.Common;

namespace EventStageTimer.Api.Tests.Fixtures;

public sealed class TestClock(DateTime initial) : IClock
{
    private DateTime _now = DateTime.SpecifyKind(initial, DateTimeKind.Utc);
    public DateTime UtcNow => _now;
    public void Advance(TimeSpan delta) => _now = _now.Add(delta);
    public void Set(DateTime utc) => _now = DateTime.SpecifyKind(utc, DateTimeKind.Utc);
}
```

- [ ] **Step 2: Implement helpers for cookie sign-in (operator) and access-code URLs (public)**

```csharp
using System.Net.Http.Json;

namespace EventStageTimer.Api.Tests.Fixtures;

public static class AuthHelpers
{
    public sealed record BootstrapResponse(Guid TenantId, Guid UserId);
    public sealed record SignInBody(string Email, string Password);

    public static async Task<BootstrapResponse> BootstrapTenantAsync(HttpClient http, string ownerEmail, string ownerPassword)
    {
        var body = new
        {
            TenantName = "Test Tenant",
            TenantSlug = "test",
            OwnerEmail = ownerEmail,
            OwnerPassword = ownerPassword,
            OwnerDisplayName = "Owner",
        };
        var resp = await http.PostAsJsonAsync("/api/setup/initialize", body);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<BootstrapResponse>())!;
    }

    public static async Task SignInAsync(HttpClient http, string email, string password)
    {
        var resp = await http.PostAsJsonAsync("/api/auth/password/signin", new SignInBody(email, password));
        resp.EnsureSuccessStatusCode();
    }
}
```

- [ ] **Step 3: Build + commit**

```bash
dotnet build tests/EventStageTimer.Api.Tests
git add . && git commit -m "test: TestClock and AuthHelpers (bootstrap + sign-in)"
```

---

## Task 45: Hub integration test — full session happy path

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Hubs/FullSessionTests.cs`

- [ ] **Step 1: Write the test (Idle → Start → Pause → Resume → Stop)**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class FullSessionTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync()
    {
        _factory = new TestApiFactory(sql);
        _http = _factory.CreateClient();
        await Task.CompletedTask;
    }

    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Operator_runs_full_session_against_seeded_room()
    {
        // 1. Seed: bootstrap, sign in, create event + room + schedule item
        var (tenantId, userId) = await AuthHelpers.BootstrapTenantAsync(_http, "owner@test.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "owner@test.local", "Strong_Pwd_123");

        var ev = await _http.PostAsJsonAsync("/api/events", new
        {
            Name = "Test Event", TimeZone = "UTC",
            StartsAtUtc = _factory.Clock.UtcNow,
            EndsAtUtc = _factory.Clock.UtcNow.AddHours(8),
        });
        ev.EnsureSuccessStatusCode();
        var eventDoc = (await ev.Content.ReadFromJsonAsync<dynamic>())!;
        Guid eventId = eventDoc.GetProperty("id").GetGuid();

        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "Main Hall" });
        room.EnsureSuccessStatusCode();
        var roomDoc = (await room.Content.ReadFromJsonAsync<dynamic>())!;
        Guid roomId = roomDoc.GetProperty("id").GetGuid();

        var item = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new
        {
            Title = "Keynote", SpeakerName = "Ada Lovelace",
            ScheduledStartUtc = _factory.Clock.UtcNow,
            DurationSec = 300, PreRollSec = 0, AutoStart = false,
        });
        item.EnsureSuccessStatusCode();
        var itemDoc = (await item.Content.ReadFromJsonAsync<dynamic>())!;
        Guid itemId = itemDoc.GetProperty("id").GetGuid();

        // 2. Connect to the hub as operator (cookie auth attaches via the test handler)
        var hubUri = new Uri(_http.BaseAddress!, "/hub/timer");
        await using var conn = new HubConnectionBuilder()
            .WithUrl(hubUri.ToString(), options =>
            {
                options.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler();
                options.Cookies = new System.Net.CookieContainer();
                // Re-attach the cookie from _http
                foreach (var c in _factory.Server.BaseAddress is null ? [] : new[] { _http.DefaultRequestHeaders })
                {
                    // (Cookie attached automatically through CreateHandler — left as a placeholder.)
                }
            })
            .Build();

        Snapshot? lastSnap = null;
        conn.On<Snapshot>("RoomStateChanged", s => lastSnap = s);
        await conn.StartAsync();

        // Wait for initial empty snapshot via Resync
        var snap = await conn.InvokeAsync<Snapshot?>("Resync", roomId);
        snap.Should().NotBeNull();
        snap!.Phase.Should().Be(TimerPhase.Idle);

        // 3. Start
        snap = await conn.InvokeAsync<Snapshot>("StartItem", roomId, itemId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Running);
        snap.StartedAtUtc.Should().NotBeNull();

        // 4. Pause + Resume
        _factory.Clock.Advance(TimeSpan.FromSeconds(60));
        snap = await conn.InvokeAsync<Snapshot>("Pause", roomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Paused);

        _factory.Clock.Advance(TimeSpan.FromSeconds(15));
        snap = await conn.InvokeAsync<Snapshot>("Resume", roomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Running);
        snap.PausedAccumSec.Should().Be(15);

        // 5. Stop
        snap = await conn.InvokeAsync<Snapshot>("Stop", roomId, snap.Version);
        snap.Phase.Should().Be(TimerPhase.Ended);

        // 6. ScheduleItemRun was opened and closed
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var run = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.ScheduleItemId == itemId);
        run.Should().NotBeNull();
        run!.EndedAtUtc.Should().NotBeNull();
        run.EndedReason.Should().Be(RunEndedReason.Stop);
    }
}
```

- [ ] **Step 2: Run the test**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~FullSessionTests
```

Expected: PASS. (First Testcontainers run pulls the SQL image — may take 60-90 seconds.)

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "test: full session integration test (Idle → Start → Pause/Resume → Stop)"
```

---

## Task 46: Hub integration test — stale-version rejection

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Hubs/StaleVersionTests.cs`

- [ ] **Step 1: Write the test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class StaleVersionTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); await Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Hub_rejects_command_with_stale_version()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "owner@test.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "owner@test.local", "Strong_Pwd_123");

        // Create event/room/item (factored out into a shared helper in T56; inline here)
        var ev = await _http.PostAsJsonAsync("/api/events", new { Name = "E", TimeZone = "UTC", StartsAtUtc = _factory.Clock.UtcNow, EndsAtUtc = _factory.Clock.UtcNow.AddHours(1) });
        var eventId = (await ev.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "R" });
        var roomId = (await room.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var item = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new { Title = "T", ScheduledStartUtc = _factory.Clock.UtcNow, DurationSec = 60, PreRollSec = 0, AutoStart = false });
        var itemId = (await item.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();

        var hubUri = new Uri(_http.BaseAddress!, "/hub/timer");
        await using var conn = new HubConnectionBuilder()
            .WithUrl(hubUri.ToString(), o => o.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler())
            .Build();
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", roomId);
        var staleVersion = snap!.Version;

        // First Start succeeds and bumps version
        await conn.InvokeAsync<Snapshot>("StartItem", roomId, itemId, staleVersion);

        // Second command with the OLD version must throw
        var act = async () => await conn.InvokeAsync<Snapshot>("Pause", roomId, staleVersion);
        await act.Should().ThrowAsync<HubException>().WithMessage("*StaleVersion*");
    }
}
```

- [ ] **Step 2: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~StaleVersionTests
git add . && git commit -m "test: hub rejects state-changing command with stale version"
```

---

## Task 47: Hub integration test — `SetMessage` does not bump version

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Hubs/MessageVersioningTests.cs`

- [ ] **Step 1: Write the test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Timer;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class MessageVersioningTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); await Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task SetMessage_does_not_bump_version_so_subsequent_state_command_with_same_version_succeeds()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");
        var ev = await _http.PostAsJsonAsync("/api/events", new { Name = "E", TimeZone = "UTC", StartsAtUtc = _factory.Clock.UtcNow, EndsAtUtc = _factory.Clock.UtcNow.AddHours(1) });
        var eventId = (await ev.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "R" });
        var roomId = (await room.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var item = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new { Title = "T", ScheduledStartUtc = _factory.Clock.UtcNow, DurationSec = 60, PreRollSec = 0, AutoStart = false });
        var itemId = (await item.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();

        var hubUri = new Uri(_http.BaseAddress!, "/hub/timer");
        await using var conn = new HubConnectionBuilder()
            .WithUrl(hubUri.ToString(), o => o.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler()).Build();
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", roomId);
        snap = await conn.InvokeAsync<Snapshot>("StartItem", roomId, itemId, snap!.Version);
        var versionAtStart = snap.Version;

        // Push messages — version must NOT change
        snap = await conn.InvokeAsync<Snapshot>("SetMessage", roomId, "Wrap up");
        snap.Version.Should().Be(versionAtStart);
        snap = await conn.InvokeAsync<Snapshot>("SetMessage", roomId, "5 min over");
        snap.Version.Should().Be(versionAtStart);

        // Stale-by-design? No — Pause with the version we already had still succeeds because messages didn't bump it.
        snap = await conn.InvokeAsync<Snapshot>("Pause", roomId, versionAtStart);
        snap.Phase.Should().Be(EventStageTimer.Domain.Entities.TimerPhase.Paused);
        snap.Version.Should().NotBe(versionAtStart); // Pause DID bump
    }
}
```

- [ ] **Step 2: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~MessageVersioningTests
git add . && git commit -m "test: SetMessage is unversioned and doesn't invalidate concurrent state commands"
```

---

## Task 48: Hub integration test — `SkipNext` is atomic

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Hubs/SkipNextAtomicityTests.cs`

- [ ] **Step 1: Write the test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Domain.Timer;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Hubs;

[Collection("sqlserver")]
public sealed class SkipNextAtomicityTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); await Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task SkipNext_closes_current_run_with_SkipReplaced_and_starts_next_item()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");
        var ev = await _http.PostAsJsonAsync("/api/events", new { Name = "E", TimeZone = "UTC", StartsAtUtc = _factory.Clock.UtcNow, EndsAtUtc = _factory.Clock.UtcNow.AddHours(1) });
        var eventId = (await ev.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "R" });
        var roomId = (await room.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var i1 = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new { Title = "First", ScheduledStartUtc = _factory.Clock.UtcNow, DurationSec = 60, PreRollSec = 0, AutoStart = false });
        var i2 = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new { Title = "Second", ScheduledStartUtc = _factory.Clock.UtcNow.AddMinutes(2), DurationSec = 60, PreRollSec = 0, AutoStart = false });
        var firstId = (await i1.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var secondId = (await i2.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();

        var hubUri = new Uri(_http.BaseAddress!, "/hub/timer");
        await using var conn = new HubConnectionBuilder().WithUrl(hubUri.ToString(), o => o.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler()).Build();
        await conn.StartAsync();

        var snap = await conn.InvokeAsync<Snapshot?>("Resync", roomId);
        snap = await conn.InvokeAsync<Snapshot>("StartItem", roomId, firstId, snap!.Version);
        snap = await conn.InvokeAsync<Snapshot>("SkipNext", roomId, snap.Version);

        snap.Phase.Should().Be(TimerPhase.Running);
        snap.CurrentItem!.Id.Should().Be(secondId);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var firstRun = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstAsync(r => r.ScheduleItemId == firstId);
        firstRun.EndedReason.Should().Be(RunEndedReason.SkipReplaced);
        firstRun.EndedAtUtc.Should().NotBeNull();

        var secondRun = await db.ScheduleItemRuns.IgnoreQueryFilters().FirstAsync(r => r.ScheduleItemId == secondId);
        secondRun.Trigger.Should().Be(RunTrigger.Skip);
        secondRun.EndedAtUtc.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~SkipNextAtomicityTests
git add . && git commit -m "test: SkipNext atomically closes current run + starts next"
```

---

## Task 49: Background test — `SchedulerService` auto-start

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Background/SchedulerServiceTests.cs`

- [ ] **Step 1: Write the test (clock-driven, deterministic)**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Domain.Entities;
using EventStageTimer.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Background;

[Collection("sqlserver")]
public sealed class SchedulerServiceTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); await Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task AutoStart_fires_at_scheduled_time_minus_preroll()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");
        var ev = await _http.PostAsJsonAsync("/api/events", new { Name = "E", TimeZone = "UTC", StartsAtUtc = _factory.Clock.UtcNow, EndsAtUtc = _factory.Clock.UtcNow.AddHours(1) });
        var eventId = (await ev.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "R" });
        var roomId = (await room.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        // Item scheduled 30s in the future, with 10s pre-roll, AutoStart=true
        var scheduled = _factory.Clock.UtcNow.AddSeconds(30);
        var i = await _http.PostAsJsonAsync($"/api/rooms/{roomId}/schedule", new { Title = "Auto", ScheduledStartUtc = scheduled, DurationSec = 60, PreRollSec = 10, AutoStart = true });
        var itemId = (await i.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();

        // Advance clock past (Scheduled - PreRoll) — i.e. 21 seconds
        _factory.Clock.Advance(TimeSpan.FromSeconds(21));

        // Wait one scheduler tick + a margin. The hosted service runs in-process.
        await WaitForPhaseAsync(roomId, TimerPhase.PreRoll, TimeSpan.FromSeconds(5));

        // Advance past pre-roll
        _factory.Clock.Advance(TimeSpan.FromSeconds(11));
        await WaitForPhaseAsync(roomId, TimerPhase.Running, TimeSpan.FromSeconds(5));
    }

    private async Task WaitForPhaseAsync(Guid roomId, TimerPhase expected, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var phase = await db.RoomTimerStates.IgnoreQueryFilters().Where(s => s.RoomId == roomId).Select(s => s.Phase).FirstAsync();
            if (phase == expected) return;
            await Task.Delay(200);
        }
        throw new TimeoutException($"Room {roomId} did not reach {expected} within {timeout}");
    }
}
```

- [ ] **Step 2: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~SchedulerServiceTests
git add . && git commit -m "test: SchedulerService auto-starts at ScheduledStart - PreRollSec, transitions to Running on expiry"
```

---

## Task 50: Public lookup — rate-limit + access-code tests

**Files:**
- Create: `tests/EventStageTimer.Api.Tests/Public/RateLimitTests.cs`
- Create: `tests/EventStageTimer.Api.Tests/Public/AccessCodeLookupTests.cs`

- [ ] **Step 1: Add a public branding endpoint to test against**

> The full branding endpoint is built in Plan 4. For now, add a minimal `/r/{code}/ping` test endpoint that returns 200 if the access code resolves. Create `src/EventStageTimer.Api/Controllers/PublicTestPingController.cs` (this controller will be deleted in Plan 4 when proper public endpoints arrive):

```csharp
using EventStageTimer.Api.Auth.Public;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
[Route("r/{code}")]
public sealed class PublicTestPingController(PublicAccessContext ctx) : ControllerBase
{
    [HttpGet("ping")]
    public IActionResult Ping() => Ok(new { roomId = ctx.RoomId, eventId = ctx.EventId });
}
```

- [ ] **Step 2: Write the rate-limit test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Public;

[Collection("sqlserver")]
public sealed class RateLimitTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync()
    {
        _factory = new TestApiFactory(sql);
        _http = _factory.CreateClient();
        await Task.CompletedTask;
    }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Public_lookup_returns_429_after_burst_exhausted()
    {
        // Burst = 30. Fire 60 requests to a non-existent code; first ~30 get 401, then 429.
        var unauthorized = 0;
        var rateLimited = 0;
        for (var i = 0; i < 60; i++)
        {
            var resp = await _http.GetAsync("/r/AAAA-AAAA/ping");
            if (resp.StatusCode == HttpStatusCode.Unauthorized) unauthorized++;
            else if (resp.StatusCode == (HttpStatusCode)429) rateLimited++;
        }
        rateLimited.Should().BeGreaterThan(0, "rate limiter should kick in once burst is consumed");
        unauthorized.Should().BeLessOrEqualTo(31); // burst + 1 refill
    }
}
```

- [ ] **Step 3: Write the access-code lookup test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using FluentAssertions;
using System.Net.Http.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Public;

[Collection("sqlserver")]
public sealed class AccessCodeLookupTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public async Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateClient(); await Task.CompletedTask; }
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task Valid_room_access_code_resolves_room_and_event()
    {
        await AuthHelpers.BootstrapTenantAsync(_http, "o@t.local", "Strong_Pwd_123");
        await AuthHelpers.SignInAsync(_http, "o@t.local", "Strong_Pwd_123");
        var ev = await _http.PostAsJsonAsync("/api/events", new { Name = "E", TimeZone = "UTC", StartsAtUtc = DateTime.UtcNow, EndsAtUtc = DateTime.UtcNow.AddHours(1) });
        var eventId = (await ev.Content.ReadFromJsonAsync<dynamic>())!.GetProperty("id").GetGuid();
        var room = await _http.PostAsJsonAsync($"/api/events/{eventId}/rooms", new { Name = "R" });
        var roomDoc = (await room.Content.ReadFromJsonAsync<dynamic>())!;
        var code = roomDoc.GetProperty("accessCode").GetString()!;
        var roomId = roomDoc.GetProperty("id").GetGuid();

        // New client (no auth cookie) — public lookup only
        var pub = _factory.CreateClient();
        var resp = await pub.GetAsync($"/r/{code[..4]}-{code[4..]}/ping");
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadFromJsonAsync<dynamic>();
        body!.GetProperty("roomId").GetGuid().Should().Be(roomId);
        body.GetProperty("eventId").GetGuid().Should().Be(eventId);
    }

    [Fact]
    public async Task Unknown_access_code_returns_401()
    {
        var pub = _factory.CreateClient();
        var resp = await pub.GetAsync("/r/AAAA-AAAA/ping");
        resp.StatusCode.Should().Be(System.Net.HttpStatusCode.Unauthorized);
    }
}
```

- [ ] **Step 4: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter FullyQualifiedName~Public.
git add . && git commit -m "test: public access code lookup + rate-limit middleware behaviour"
```

---
