# Backend Kernel — Execution Progress

**Plan:** `docs/superpowers/plans/2026-05-10-backend-kernel.md`
**Spec:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md`

## Completed (9 of 57 plan tasks)

| Task | Description | Commit | Notes |
|---|---|---|---|
| T1 | Solution scaffolding (.sln, csprojs, central pkg mgmt, .editorconfig) | `1b1fec7` + `4b95cdc` | UnitTest1.cs stubs cleaned up |
| T2 | Domain primitives: `AccessCode`, `IClock`, `SystemClock`, `Result<T,TError>` + 12 unit tests | `e3e2951` | TDD; all tests pass |
| T3 | Identity entities: `Tenant`, `User`, `TenantMembership` (+ enums) | `bdb3304` then `60ff968` | Domain references `Microsoft.Extensions.Identity.Stores` (NOT `.EntityFrameworkCore`) — keep this layering |
| T4–T8 | All 14 remaining entities + 5 enums | `6e047a5` | Inline-executed as one batch (mechanical copy-paste) |
| T9 | `AppDbContext` + multi-tenant query filters + `ITenantContext` interface | `ad7f4a5` | EF Core / Identity.EntityFrameworkCore packages added to Infrastructure project |

## Remaining (T10 onward — see plan)

- **T10:** Initial EF migration + apply-on-startup wiring in `Program.cs`
- **T11:** `TenantContext` impl + `TenantResolutionMiddleware`
- **T12:** `TimerStateMachine` (pure logic, TDD)
- **T13–T19:** `Snapshot` DTO, `ITimerCommandService` + all command handlers
- **T20–T22:** `IEmailSender` (NoOp + SMTP), `AccessCodeGenerator`
- **T23–T28:** ASP.NET Core Identity setup, magic-link + password auth controllers, bootstrap
- **T29–T31:** Authorization policies (`EventAccess`, `RoomAccess`), public access-code auth scheme
- **T32:** `PublicRateLimitMiddleware`
- **T33–T35:** REST controllers (Events, Rooms, ScheduleItems)
- **T36–T40:** `TimerHub` (groups, snapshot, versioned + unversioned methods, public connect)
- **T41:** `SchedulerService` background loop
- **T42:** `AuditWriter`
- **T43–T54:** Test infrastructure (Testcontainers SQL, factory, clock, helpers) + integration tests
- **T55–T57:** Final consolidated `Program.cs`, README + `CLAUDE.md`, plan-end self-check

## Known issues / decisions

- **Transitive vulnerability:** `System.Security.Cryptography.Xml` carries `GHSA-37gx-xxp4-5rgx` and `GHSA-w3x6-4m5h-cxqf` advisories at all current versions through 10.0.0. No patched version exists yet — pin does not help. Ignore the `NU1903` warnings until Microsoft ships a fix.
- **`coverlet.collector`** is in `Directory.Packages.props` — auto-added by xUnit templates with central pinning, retained intentionally.

## How to resume in a new session

Tell Claude:

> Read `docs/superpowers/PROGRESS.md`, then continue executing
> `docs/superpowers/plans/2026-05-10-backend-kernel.md` from Task T10 onward.
> Use the same execution model as last session — inline-execute mechanical
> copy-paste tasks, dispatch a subagent with full dual review for substantive
> tasks (state machine, command service, hub, scheduler, integration tests).

The plan task list is checkbox-driven (`- [ ]`); each task body has the exact code to write. The spec is referenced by section anchors throughout the plan.
