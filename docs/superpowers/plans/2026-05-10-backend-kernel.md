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
