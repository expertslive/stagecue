# Event Stage Timer — Agent Guide

This repository implements the design at `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md`. Read it before editing.

## Hard constraints

- **Never** bypass the multi-tenant query filter without `IgnoreQueryFilters()` AND a clearly system-scoped reason. Every cross-tenant read must be intentional.
- **Never** add per-row `RoomTimerState.Version` bumps to message updates — `SetMessage` / `ClearMessage` are last-write-wins by design (spec §4.5, §6.4). The integration test `MessageVersioningTests` enforces this. The implementation uses `ExecuteUpdateAsync` to write the column without loading the entity, which means EF doesn't bump the rowversion.
- **Never** set `RoomTimerState.StartedAtUtc = now` when transitioning out of `PreRoll`. Use `PreRollEndsAtUtc`. The 1Hz scheduler tick can fire late (spec §6.2).
- **Never** start an item without going through `TimerCommandService.StartItemAsync`. The auto-select logic lives only on the operator's `StartAuto` path; the scheduler always passes an explicit `scheduleItemId`.
- **Never** put EF Core, ASP.NET, or SignalR types in `EventStageTimer.Domain`. Domain references `Microsoft.Extensions.Identity.Stores` (NOT `.EntityFrameworkCore`) for `IdentityUser<TKey>` only.

## Architectural anchors

- `EventStageTimer.Domain` has zero infrastructure dependencies. EF Core, SignalR, ASP.NET — none of those types may appear here.
- `TimerStateMachine` is pure (no I/O). DB writes happen in `TimerCommandService`. Tests cover the state machine in pure unit tests; the service is covered by integration tests.
- Public access codes are stored undashed (8 chars, base32-safe alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) but rendered dashed (`XXXX-XXXX`). Use `AccessCode.From` / `AccessCode.Formatted`. `AccessCode.TryParse` accepts both forms.
- Hub auth is dual-scheme: cookie (operators) + `PublicAccessCode` (public surfaces). The latter reads the code from the path `/r/{code}/...` or `/e/{code}/...`, or from `?code=…` on hub negotiate.
- Tenant scoping: `ITenantContext` is request-scoped. `TenantResolutionMiddleware` populates it from a `tid` claim (authenticated requests) or by looking up the access code (public requests). EF global query filters apply automatically.

## Tests

- Run `dotnet test` before claiming any task complete.
- `Domain.Tests` must stay deterministic (no I/O). `Api.Tests` use Testcontainers SQL Server — Docker required.
- When writing new hub tests, use `AuthHelpers.BuildAuthenticatedHubConnection(factory, http)` — the default `WebApplicationFactory` handler doesn't maintain cookies; the helper wires a `DelegatingHandler` that re-attaches the captured `est.session` cookie on every hub HTTP request.

## Pacing for plan execution

The execution log is in `docs/superpowers/PROGRESS.md`. Each commit corresponds to one or a small batch of plan tasks. Substantive tasks (state machine, command service, hub, scheduler, integration tests) get their own commits; mechanical entity / DTO / config tasks are batched.
