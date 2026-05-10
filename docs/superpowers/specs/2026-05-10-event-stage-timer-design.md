# Event Stage Timer — Design

**Date:** 2026-05-10
**Status:** Draft for review

## 1. Purpose

A web application that drives countdown timers for speakers at events. Operators configure rooms and per-room schedules from a control panel; speakers see a polished countdown on a confidence monitor or tablet next to their laptop; audience-facing screens show what's running and what's next. The system supports multiple concurrent rooms, runs as a single Docker image (locally at the venue or on Azure), and is multi-tenant SaaS by default with a single-tenant self-host mode from the same codebase.

## 2. Scope

### In scope (v1)

- Per-event configuration of rooms, schedules, themes, message templates
- Per-room scheduled items with start time, duration, pre-roll, configurable color thresholds, and auto-start vs manual-start
- Live operator controls: start / pause / resume / stop / reset, time adjustments (±30s, ±1m, ±5m, set exact), live messages (free text + saved templates), skip-to-next
- Four client surfaces: control panel (auth), speaker view (public token), room-door view (public token), lobby overview (public token)
- Per-event branding: theme tokens (with defaults that can be overridden) + uploaded logo
- Full RBAC: tenant-level admins, event-level roles (`EventAdmin`, `RoomOperator` (optionally room-scoped), `Viewer`), email-based invitations
- Two auth modes: cloud (email magic link, requires SMTP) and local (email + password)
- Public surfaces accessible via short, regeneratable access codes (no auth)
- Server-authoritative timer state with client-side ticking driven by a measured server-clock skew (resilient to brief network drops)
- Audit log of operator actions
- Multi-tenant data isolation
- Single Docker image deploys to local hardware or Azure Container Apps; SQL Server runs as a sidecar (compose) or as Azure SQL

### Out of scope (v1)

- Native mobile apps (control panel must be responsive but no native client)
- Live video streaming, recording, or AV integration
- Speaker-side interactivity (notes, advancing slides, marking sections done)
- Public attendee-facing schedule pages with personalization (favorites, calendar export)
- Notifications to speakers (email/SMS reminders)
- Recurring/templatable events, schedule import/export (CSV/iCal)
- Payment / billing (org plans, usage limits) — added later when SaaS launches commercially
- Full offline-first PWA mode (control panel and public views require connectivity to receive state changes; brief drops are tolerated through client-side ticking)
- Distributed scheduling for horizontally-scaled instances (single-instance scheduler is sufficient for v1; Redis backplane and leader election deferred)

## 3. Users & roles

### Tenant level

- **Tenant Owner** — created on first signup (SaaS) or seeded at install (self-host). Manages tenant settings, billing (future), can create events and assign Tenant Admins.
- **Tenant Admin** — same capabilities as Owner except cannot delete the tenant or transfer ownership.

### Event level (assigned per event via `EventMembership`)

- **Event Admin** — full control over one event: rooms, schedules, themes, members, message templates, all rooms' live controls.
- **Room Operator** — runs live controls for one or more specific rooms (`ScopedRoomIds`). Can edit schedule items for those rooms during the event but cannot reconfigure rooms, change theme, or invite users.
- **Viewer** — read-only access to the event's control panel (sees current state across all rooms but cannot push any control).

### Public (no account)

Public surfaces (speaker view, door view, lobby view) are accessed by URLs containing 6-character access codes (base32, omitting `0`, `1`, `I`, `O`). Each room has its own access code; each event has a separate code for the lobby. Access codes are regeneratable; old codes are invalidated immediately on regeneration.

## 4. Functional requirements

### 4.1 Control panel (authenticated)

A single-page React application. After login, the user sees a list of events they have access to. Selecting an event opens its dashboard.

**Event dashboard** — top-level view. Shows all rooms in a grid; each tile shows current item, phase (Idle / PreRoll / Running / Paused / Overrun / Ended), remaining time, and a "Open room control" link. Updates in realtime via SignalR.

**Room control** — focused view for one room. Includes:
- The current item (title, speaker, scheduled start, duration, pre-roll, thresholds)
- Live controls: Start, Pause/Resume, Stop, Reset, Skip-next
- Time adjustments: ±30s, ±1m, ±5m, "set exact" input
- Live message: free-text input + clickable saved templates; "Clear message" button
- A timeline strip showing the room's schedule with the current item highlighted
- Read-only mirror of what the speaker view shows (so the operator can verify the speaker is seeing the right thing)

**Schedule editor** — for an event:
- Per-room ordered list of schedule items with drag-to-reorder
- Per-item fields: title, speaker name, scheduled start time (in event time zone), duration (mm:ss), pre-roll seconds, auto-start toggle, thresholds list (each: seconds remaining + color token + optional label)
- An event-level default thresholds list that newly-created items inherit
- Bulk operations: clone item, delete, shift all subsequent times by N minutes

**Members** — invite by email, assign role, scope room operators to specific rooms. Pending invitations are listed with copyable acceptance links (for environments without SMTP). Invitations expire after 7 days.

**Branding** — upload logo (PNG / SVG, max 2 MB), edit theme tokens. A live preview of the speaker view uses the current draft tokens.

**Message templates** — a CRUD list of templates the operator can quickly fire from room control.

**Access codes** — view all codes for the event (per-room codes + event lobby code), copy URL, copy QR PNG, regenerate. A regenerate confirmation warns that printed signage will stop working.

**Audit log** — chronological list of operator actions (action type, user, room, timestamp, details). Filter by user, room, action.

### 4.2 Speaker view (public, token-gated)

URL pattern: `/r/{accessCode}/speaker`. Layout (locked to "Layout A" from brainstorming):

- Header (small, top): current item title + speaker name
- Center: massive countdown, `MM:SS` (or `H:MM:SS` if duration ≥ 1 hour), tabular numerals, color driven by current threshold (or `--overrun` token when remaining ≤ 0)
- Footer (small, bottom): "Next: {title} ({startTime})" — hidden if no next item
- Message overlay: appears centered above the footer when `CurrentMessage` is non-null; subtle fade in/out
- Pre-roll mode: countdown shows pre-roll remaining with a "Starts in" label; switches to running display at zero
- Overrun mode: countdown displays as `+MM:SS` (count-up from zero) with `--overrun` color
- Idle / Ended: a quiet "Up next at {time}" or event branding placeholder

Fullscreen-friendly. No interactive controls. Auto-reconnects via SignalR. Theme tokens applied as CSS custom properties scoped to this surface.

### 4.3 Room-door view (public, token-gated)

URL pattern: `/r/{accessCode}/door`. Designed for a vertical or horizontal screen outside the room. Shows:
- Event logo (top)
- Now playing: title, speaker, scheduled time, remaining time
- Up next (one or two items): titles, speakers, scheduled times
- A subtle status indicator (e.g., "Running", "Starting in 5 min", "Ended")

Updates in realtime. No countdown animation as prominent as the speaker view; emphasis is on context.

### 4.4 Lobby view (public, token-gated)

URL pattern: `/e/{accessCode}/lobby`. Designed for a single big screen showing all rooms at once. Shows:
- Event logo and name
- A grid of room cards, one per room: room name, current item title, current speaker, remaining time, status indicator
- Sorted by room name; configurable per event in v2

Updates in realtime.

### 4.5 Live controls — semantics

- **Start** — only valid when phase is `Idle`. If the current schedule item has a pre-roll, transitions to `PreRoll` with `PreRollEndsAtUtc = now + preRollSec`. Otherwise transitions to `Running` and sets `StartedAtUtc = now`. If no current item is set, the server picks the next item: the first one (by `Position`) whose `ScheduledStartUtc ≥ now` if any, otherwise the last item that has not yet ended.
- **Pause** — valid in `Running`. Sets `PauseStartedAtUtc = now`, phase = `Paused`.
- **Resume** — valid in `Paused`. Computes `PausedAccumSec += (now - PauseStartedAtUtc)`, clears `PauseStartedAtUtc`, phase = `Running`.
- **Stop** — valid in `Running`, `Paused`, or implied `Overrun`. Phase = `Ended`. The operator chooses what to do next (start next item or leave idle).
- **Reset** — any phase. Clears `StartedAtUtc`, `PausedAccumSec`, `AdjustmentSec`, `CurrentMessage`. Phase = `Idle`. Schedule item assignment is preserved.
- **Skip-next** — equivalent to Stop + Start on the next schedule item by `Position`.
- **Adjust ±N** — adds N seconds to `AdjustmentSec`. Allowed in `Running` and `Paused`. Adjustments are cumulative and bounded so total adjustment cannot bring remaining below `−24h` or above `+24h`.
- **Set exact remaining** — computes a delta from the current effective remaining and applies it to `AdjustmentSec`. Allowed in `Running` and `Paused`.
- **Set message** — updates `CurrentMessage`. Allowed in any phase (operator may want to display a message even before a session starts). Empty string clears.
- **Clear message** — sets `CurrentMessage` to null.

Every live-control invocation writes an `AuditLogEntry` with `Action`, `RoomId`, `UserId`, and a JSON `Details` blob (e.g., `{ "deltaSec": 30 }`).

### 4.6 Scheduler (background)

A `BackgroundService` ticks once per second. For each room with a schedule item that has `AutoStart = true` and `ScheduledStartUtc - PreRollSec ≤ now`, if the room is `Idle`, it triggers the same Start path as the operator action (with `UserId = null`, `Action = "AutoStart"`). The scheduler is idempotent: it does nothing if the room is already non-idle. With a single instance this is sufficient. For scaled-out deployments (deferred), a leader-election layer over Redis or SQL Server distributed locks would coordinate which instance fires.

## 5. Data model

All entities below carry `TenantId` (except `Tenant` itself); EF Core global query filters scope every read by the current tenant. Soft-delete via `DeletedAtUtc` on user-facing entities.

| Entity | Key fields | Notes |
|---|---|---|
| `Tenant` | `Id`, `Name`, `Slug`, `Mode` (`SaaS` / `SelfHost`) | |
| `User` | `Id`, `Email` (unique), `PasswordHash?`, `DisplayName` | `PasswordHash` populated only in local-auth mode |
| `TenantMembership` | `TenantId`, `UserId`, `Role` (`Owner` / `Admin`) | |
| `Event` | `Id`, `TenantId`, `Name`, `TimeZone` (IANA), `StartsAtUtc`, `EndsAtUtc`, `LobbyAccessCode`, `LogoBlobKey?`, `ThemeJson`, `DefaultThresholdsJson` | |
| `EventMembership` | `EventId`, `UserId`, `Role` (`EventAdmin` / `RoomOperator` / `Viewer`), `ScopedRoomIds?` (CSV or join table) | |
| `Invitation` | `Id`, `EventId`, `Email`, `Role`, `ScopedRoomIds?`, `Token`, `ExpiresAt`, `AcceptedAt?` | |
| `Room` | `Id`, `EventId`, `Name`, `AccessCode` (6-char base32), `DefaultPreRollSec` | |
| `ScheduleItem` | `Id`, `RoomId`, `Position`, `Title`, `SpeakerName?`, `ScheduledStartUtc`, `DurationSec`, `PreRollSec`, `AutoStart`, `ThresholdsJson?` | `ThresholdsJson` overrides `Event.DefaultThresholdsJson` if present |
| `MessageTemplate` | `Id`, `EventId`, `Text`, `SortOrder` | |
| `RoomTimerState` | `RoomId` (PK), `CurrentItemId?`, `Phase`, `StartedAtUtc?`, `PreRollEndsAtUtc?`, `PauseStartedAtUtc?`, `PausedAccumSec`, `AdjustmentSec`, `CurrentMessage?`, `Version` (rowversion) | One row per room; the only entity that changes during a live session |
| `AuditLogEntry` | `Id`, `TenantId`, `EventId?`, `RoomId?`, `UserId?`, `Action`, `DetailsJson`, `AtUtc` | Append-only |
| `AuthMagicLink` | `Token` (PK), `UserId`, `ExpiresAt`, `UsedAt?` | SaaS / cloud auth only |

Indexes: `User.Email` (unique), `Event.TenantId`, `Room.EventId`, `Room.AccessCode` (unique within tenant), `Event.LobbyAccessCode` (unique within tenant), `ScheduleItem.RoomId + Position`, `AuditLogEntry.TenantId + AtUtc`.

`ThemeJson` is a JSON object of token-name → CSS-value overrides; missing tokens fall back to a built-in default set (defined in the React app and re-exported as a JSON literal so the spec stays single-source).

## 6. Timer state machine and computation

### 6.1 States

`Idle`, `PreRoll`, `Running`, `Paused`, `Overrun` (display-only — derived), `Ended`.

### 6.2 Transitions

| From | To | Trigger | Side effects |
|---|---|---|---|
| `Idle` | `PreRoll` | Operator Start with `PreRollSec > 0`; or scheduler at `ScheduledStart - PreRollSec` if `AutoStart` | Set `CurrentItemId`, `PreRollEndsAtUtc = now + PreRollSec`, `Phase = PreRoll` |
| `Idle` | `Running` | Operator Start with `PreRollSec = 0` | Set `CurrentItemId`, `StartedAtUtc = now`, `Phase = Running` |
| `PreRoll` | `Running` | `now ≥ PreRollEndsAtUtc` (server-side `Tick`) | Set `StartedAtUtc = now`, clear `PreRollEndsAtUtc`, `Phase = Running` |
| `Running` | `Paused` | Operator Pause | Set `PauseStartedAtUtc = now` |
| `Paused` | `Running` | Operator Resume | `PausedAccumSec += now − PauseStartedAtUtc`; clear `PauseStartedAtUtc` |
| `Running` / `Paused` | `Ended` | Operator Stop | Clear `StartedAtUtc`, `PausedAccumSec`, `AdjustmentSec`, `PauseStartedAtUtc` |
| `Running` / `Paused` / `Ended` | next item's `PreRoll` or `Running` | Operator Skip-next or scheduler advances | Atomic Stop-current + Start-next within one transaction; Skip-next on `Ended` is functionally an explicit advance |
| any | `Idle` | Operator Reset | Clear `StartedAtUtc`, `PreRollEndsAtUtc`, `PauseStartedAtUtc`, `PausedAccumSec`, `AdjustmentSec`, `CurrentMessage`; preserve `CurrentItemId` |
| `Ended` | `PreRoll` / `Running` / `Idle` | Operator advances or scheduler picks next item | As Idle → PreRoll/Running |

`Overrun` is not a stored phase. While `Phase = Running`, if the client computes remaining ≤ 0, it switches the visual mode to overrun (count-up, `--overrun` color). This avoids a server write at the moment time runs out and keeps the model simple.

### 6.3 Client-side display computation

At SignalR handshake, the client measures `clockSkewMs` by comparing the server timestamp in the welcome payload to `Date.now()` and recording the offset. On every animation frame (throttled to ~10 Hz to spare batteries):

```
serverNow = Date.now() + clockSkewMs

if state.phase == "PreRoll":
    remainingMs = state.preRollEndsAtUtc - serverNow

elif state.phase == "Running":
    elapsedMs = (serverNow - state.startedAtUtc) - state.pausedAccumSec*1000
    totalMs   = (state.durationSec + state.adjustmentSec) * 1000
    remainingMs = totalMs - elapsedMs
    # Overrun is derived: render count-up if remainingMs <= 0

elif state.phase == "Paused":
    # Server includes pauseRemainingMs in the snapshot when phase flips to Paused
    remainingMs = state.pauseRemainingMs

else:  # Idle, Ended
    remainingMs = 0
```

The active threshold is the one with the largest `secondsRemaining` such that `secondsRemaining*1000 ≥ remainingMs`. Its `colorToken` is read from CSS variables on the speaker view.

### 6.4 Snapshot payload (over SignalR)

When a client joins a room group or a transition occurs, the server pushes the full state:

```json
{
  "roomId": "…",
  "currentItem": { "id": "…", "title": "…", "speakerName": "…", "scheduledStartUtc": "…", "durationSec": 1800, "preRollSec": 30, "thresholds": [...] },
  "nextItem":     { "title": "…", "scheduledStartUtc": "…" } ,
  "phase": "Running",
  "startedAtUtc": "2026-05-10T13:00:42Z",
  "preRollEndsAtUtc": null,
  "pauseStartedAtUtc": null,
  "pausedAccumSec": 0,
  "adjustmentSec": 0,
  "pauseRemainingMs": null,
  "currentMessage": null,
  "serverNowUtc": "2026-05-10T13:01:15Z",
  "version": 17
}
```

`serverNowUtc` lets the client refresh its clock skew on every snapshot. `version` (from the `rowversion` column) supports optimistic concurrency on the server: every operator command includes the version it's acting on; mismatched versions are rejected with a "stale state, please retry" error.

## 7. Realtime architecture (SignalR)

A single `TimerHub`. Authenticated clients (control panel) attach with their bearer token; public clients (speaker / door / lobby) attach with the access-code path parameter and the server validates it against `Room.AccessCode` or `Event.LobbyAccessCode`.

**Groups:**
- `room:{roomId}` — speaker view, door view, all operators currently focused on the room
- `event-lobby:{eventId}` — lobby view subscribers
- `event-control:{eventId}` — operators on the event dashboard (receive updates for every room in the event)

**Server → client events:**
- `RoomStateChanged(roomId, snapshot)` — fired on every transition or property update
- `MessageChanged(roomId, message?)`
- `ScheduleChanged(eventId, roomId)` — minor changes (renamed item, etc.) — clients refetch
- `EventBrandingChanged(eventId)` — public views refetch theme/logo

**Client → server methods (operator-authenticated):**
- `Start(roomId, version)`, `Pause`, `Resume`, `Stop`, `Reset`, `SkipNext`
- `AdjustTime(roomId, deltaSec, version)`
- `SetExactRemaining(roomId, remainingSec, version)`
- `SetMessage(roomId, message)` / `ClearMessage(roomId)`

All hub method invocations go through an authorization filter that checks the user's role on the parent event and (for `RoomOperator`) the room scope.

Public clients only listen — they cannot invoke any method.

## 8. Background services

- **`SchedulerService`** — `IHostedService` running a 1Hz loop. Holds a per-tenant in-memory cache of upcoming auto-start triggers, refreshed on schedule edits. Fires the same internal `StartItem` command the hub uses, attributed to a system principal.
- **`PreRollExpiryService`** — same loop watches rooms in `PreRoll` for `now ≥ PreRollEndsAtUtc` and transitions them to `Running`. Could be folded into `SchedulerService`.
- **`InvitationEmailService`** — drains an in-memory queue of pending invitation emails (SaaS only). On failure, retries with exponential backoff; persistent failures surface in the audit log.
- **`MagicLinkEmailService`** — same shape, for sign-in magic links.

For v1 these run in-process with the API. No external queue (Service Bus, RabbitMQ) is required for the scale we're targeting.

## 9. Authentication & authorization

### 9.1 Auth modes

The deployment chooses a mode via `Auth:Mode` config:

- **`MagicLink`** (cloud default) — sign-in flow: user enters email → server creates an `AuthMagicLink` row (single-use, 15-minute expiry) and emails the link → clicking the link logs the user in. No passwords stored. Requires `Smtp:*` config.
- **`Password`** (self-host default) — sign-in flow: email + password against `User.PasswordHash` (ASP.NET Identity defaults: PBKDF2). User registration is open only to invited emails or via the initial bootstrap flow that creates the first Tenant Owner. Optional: enable `Lockout` policies via Identity's standard config.

Both modes use ASP.NET Core Identity tables (with `PasswordHash` simply unused in `MagicLink` mode). Sessions are JWT cookies (HttpOnly, Secure, SameSite=Lax) issued on successful sign-in.

### 9.2 Authorization

Implemented via ASP.NET Core authorization policies + a custom `IAuthorizationRequirement`:

- `EventAccessRequirement(role)` — checks that the calling user has at least the specified role on the parent event. Resolves the event from the route or hub method argument.
- `RoomAccessRequirement(role)` — same, then additionally checks `ScopedRoomIds` if the user is a `RoomOperator`.

Public surfaces use a separate authentication scheme (`PublicAccessCode`) where the access code is validated against the database and a short-lived claims principal is created for the SignalR connection.

### 9.3 Bootstrap

- **Self-host**: on first run with an empty database, the app creates a single Tenant in `SelfHost` mode and prompts (via a setup wizard at `/setup`) for the first Tenant Owner email + password.
- **SaaS**: signup creates a Tenant in `SaaS` mode with the signing-up user as Owner. Signup can be feature-flagged off if the deployment is invite-only.

## 10. Branding

- A built-in default theme is defined as a JSON literal in the React app (`themeDefaults.ts`). Tokens include: `--bg`, `--surface`, `--text-primary`, `--text-muted`, `--primary`, `--accent`, `--warning`, `--overrun`, `--message-bg`, `--message-text`, plus per-threshold tokens `--threshold-1` through `--threshold-N` for arbitrary configurations.
- Per event, `Event.ThemeJson` carries a partial overrides object. At render of any public view, the API exposes `GET /api/public/{accessCode}/branding` which returns `{ theme: merged-tokens, logoUrl: "/api/public/{accessCode}/logo" or null, eventName }`.
- `Event.LogoBlobKey` references a blob in the configured storage backend, served at the logo URL above.
- File storage is abstracted behind `IFileStorage` with two implementations:
  - `LocalFileStorage` — files under a configured directory (`Storage:LocalRoot`), mounted as a Docker volume in self-host
  - `AzureBlobStorage` — for SaaS (`Storage:AzureConnectionString`, `Storage:Container`)
- Selected by `Storage:Mode` config (`Local` / `AzureBlob`).
- Logo upload constraints: PNG or SVG, max 2 MB, optional width/height clamps enforced server-side. Filenames are random ULIDs to prevent collisions and enumeration.

## 11. Public access codes

- 6 characters from a 32-char alphabet (uppercase A-Z plus digits 2-9, omitting `0`, `1`, `I`, `O` to avoid visual confusion).
- Generated with a CSPRNG; **uniqueness enforced globally within the deployment** (across all tenants), with a unique index on `Room.AccessCode` and `Event.LobbyAccessCode`; collision retry on insert. This avoids needing per-tenant subdomain routing in v1: looking up a code reveals its tenant unambiguously.
- A code length of 6 from a 32-char alphabet gives ~10⁹ possibilities; collision probability stays negligible into the millions of rooms. If we ever need a wider keyspace, we can extend to 7 characters per new code without invalidating existing ones.
- Regenerating a code immediately invalidates the previous code; the audit log records the regeneration, and any active SignalR connections using the old code are dropped (clients then show a "URL no longer valid" screen).
- QR codes for each access URL are generated on demand via `QRCoder` (server-side PNG) for printing.

## 12. Container, deployment, and configuration

### 12.1 Image

A single multi-stage Dockerfile:

1. **Stage 1 (`node:lts-alpine`)** — `npm ci && npm run build` in `/src/web`, producing `/src/web/dist`.
2. **Stage 2 (`mcr.microsoft.com/dotnet/sdk:10.0`)** — `dotnet publish -c Release` of the API, copies the React `dist` into `wwwroot`.
3. **Stage 3 (`mcr.microsoft.com/dotnet/aspnet:10.0`)** — runtime image, exposes port 8080, runs the API.

The API serves `wwwroot` as static files with SPA fallback (`MapFallbackToFile("index.html")`). One container, one process.

### 12.2 Compose stack (self-host)

`docker-compose.yml` ships with:
- The app container (this image)
- `mcr.microsoft.com/mssql/server:2022-latest` for SQL Server (Developer edition by default — free for non-production; customers running paid events should switch to a licensed Standard or Express edition image)
- A named volume for SQL data
- A named volume for `Storage:LocalRoot` (logo uploads)

A single `docker compose up` after editing `.env` (admin email, SMTP settings if cloud, etc.) is sufficient.

### 12.3 Azure deployment (SaaS)

- Azure Container Apps for the app
- Azure SQL Database (Hyperscale or Business Critical for performance, depending on tenant scale)
- Azure Blob Storage for logos
- Azure Application Insights for telemetry
- Azure Communication Services or SendGrid for SMTP
- Custom domains terminated at Azure Front Door for tenant subdomains (later)

### 12.4 Configuration matrix

| Setting | Cloud | Self-host |
|---|---|---|
| `Auth:Mode` | `MagicLink` | `Password` |
| `Storage:Mode` | `AzureBlob` | `Local` |
| `Database:ConnectionString` | Azure SQL connection string | Local SQL Server connection string |
| `Database:EnableAzureSqlRetry` | `true` | `false` |
| `Smtp:*` | required | optional |
| `Telemetry:Provider` | `ApplicationInsights` | `Console` |
| `Tenancy:Mode` | `Multi` | `Single` (auto-bootstrapped) |

EF Core migrations are applied automatically on startup if `Database:AutoMigrate=true` (default in self-host, off in SaaS where ops apply migrations explicitly).

## 13. Error handling and resilience

- **Client network drops** — SignalR auto-reconnect with exponential backoff (built in to the client). Until reconnect, the speaker view keeps ticking from the last snapshot using local time. On reconnect, the client requests a fresh snapshot via the hub method `Resync(roomId)` and resumes.
- **Stale operator commands** — every command carries the `version` the operator saw. The server rejects mismatches with a `409 Stale State`; the operator's UI auto-refreshes from the latest snapshot and surfaces a non-blocking toast.
- **Concurrent operator edits to schedule** — schedule item updates use the same `rowversion` / `version` mechanism; the loser sees a conflict dialog and can re-apply.
- **SchedulerService crash** — supervisor restart by ASP.NET Core hosting; on restart, the loop re-reads upcoming triggers from the database. Idempotent: triggers already fired (rooms in non-Idle state) are skipped.
- **Database transient errors** — EF Core retry-on-failure policy enabled (max 5 retries, exponential backoff).
- **Email send failures** — logged and retried with backoff; persistent failures surface a "show invitation link manually" path in the UI so events aren't blocked.
- **Public access code typo / revocation** — server returns a friendly "URL not valid" screen with a contact-the-organizer message. Public surfaces never expose tenant or event identifiers in errors.
- **Time skew on confidence monitors** — clock skew measured every snapshot. If skew jumps more than 2 seconds between snapshots, the client logs a warning and refreshes its baseline.
- **Server clock change (NTP step)** — the server serializes timestamps in UTC and uses monotonic clocks for short-interval calculations where available; explicit unit tests cover daylight-saving transitions in event time zones.

## 14. Testing strategy

- **Unit tests** (xUnit + FluentAssertions) — domain logic: state machine transitions, threshold computation, timer math, RBAC policy resolution, access-code validation, branding token merging.
- **Integration tests** (`WebApplicationFactory`) — REST endpoints and hub methods against an in-memory SQL Server instance (LocalDB or `Testcontainers.MsSql`). Cover happy paths and stale-version conflicts.
- **Realtime tests** — SignalR test client connecting to `WebApplicationFactory`; verify group membership, message routing, snapshot correctness, reconnect behavior.
- **End-to-end tests** (Playwright) — control panel: create event, configure room, run a 30-second simulated session against a fast-forward clock; speaker view: countdown progression, threshold color flip, overrun, message overlay; door and lobby views: realtime updates.
- **Time-travel test infrastructure** — a `IClock` abstraction so tests can advance time deterministically.
- **Performance smoke** — k6 or Locust script that simulates 50 rooms, 100 concurrent public viewers, and 10 operators issuing commands per minute; asserts P99 hub round-trip < 250 ms.

## 15. Decisions and open items

### Decided

- Stack: ASP.NET Core 10, SignalR, EF Core, MS SQL Server, React 19 + Vite + TypeScript + Tailwind + shadcn/ui
- Single Docker image, optional compose for self-host
- Multi-tenant with `TenantId` row-scoping
- Server-authoritative state, client-side ticking with measured clock skew
- Public access via 6-char codes (regeneratable)
- Per-event branding: theme tokens with defaults + logo upload
- Configurable threshold list per schedule item, inheriting from event default
- Two auth modes (`MagicLink` cloud / `Password` self-host)

### Deferred (post-v1)

- Horizontal scaling with Redis backplane and leader-elected scheduler
- Native attendee-facing schedule pages
- Tenant subdomain routing in SaaS
- Event templates / cloning
- iCal / CSV import-export
- Speaker-side interactivity
- Billing and plan limits

### Open (decide before plan)

- Naming for the product (currently working title "Event Stage Timer")
- Whether `RoomOperator` scoping uses CSV `ScopedRoomIds` or a join table — preference: join table (`EventMembershipRoom`) for query simplicity, but CSV is acceptable for v1
- Whether logo upload should also enforce a colour-contrast check against the chosen theme tokens — deferred unless events report problems

## 16. Implementation phasing (provisional — to be refined in plan)

1. **Foundation** — solution scaffolding, EF Core schema, migrations, identity, Tenant + Event + Room CRUD, RBAC, audit log
2. **Timer core** — `RoomTimerState`, hub, state machine, scheduler, integration tests
3. **Control panel** — React shell, login, event dashboard, room control, schedule editor
4. **Speaker view** — Layout A, public access codes, theme tokens
5. **Door view + Lobby view** — public surfaces
6. **Branding** — theme editor + logo upload, file storage abstraction
7. **Live messages + templates**
8. **Polishing** — audit log UI, invitations UI, QR codes, settings
9. **Container packaging + Azure deployment**

The implementation plan (next step) will turn these phases into a sequenced set of executable tasks with dependencies and review checkpoints.
