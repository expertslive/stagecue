# Schedule Editor + Audience Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operator's schedule editor (drag-to-reorder + create/edit/delete with thresholds), the public room-door view (current + upcoming for one room), the public lobby view (all rooms in an event at once), and the message-templates CRUD UI. Backend gains a `MessageTemplatesController` and two public-info endpoints (`/r/{code}/info`, `/e/{code}/info`) that audience views consume to render names and room lists.

**Architecture:** Continues from Plan 2. Schedule editor uses `@dnd-kit/sortable` for drag-and-drop and a modal form for create/edit. Door and lobby views share the same `useTimerHub` machinery — door connects with the room access code, lobby connects with the event lobby code (which the existing `PublicAccessCode` auth scheme already resolves). The lobby SignalR client receives one `RoomStateChanged` snapshot per room in the event when it joins the `event-lobby:{eventId}` group (the backend already pushes initial snapshots in `TimerHub.OnConnectedAsync`).

**Tech Stack additions:** `@dnd-kit/core`, `@dnd-kit/sortable` (frontend). Backend uses existing patterns.

**Spec reference:** `docs/superpowers/specs/2026-05-10-event-stage-timer-design.md` — §4.1 schedule editor, §4.3 door view, §4.4 lobby view, §4.1 message templates.

---

## File structure

```
src/EventStageTimer.Api/
  Controllers/
    MessageTemplatesController.cs      # T1
    PublicInfoController.cs            # T2 (replaces PublicTestPingController)

src/web/src/
  api/
    scheduleItems.ts                   # T4 — CRUD calls (extends Plan 2 rooms.ts)
    messageTemplates.ts                # T5
    publicInfo.ts                      # T6
  components/
    control/
      ScheduleEditor.tsx               # T7 — drag-and-drop list
      ScheduleItemForm.tsx             # T7 — modal for create/edit
      ThresholdsEditor.tsx             # T7 — sub-component for the thresholds JSON
      MessageTemplatesEditor.tsx       # T8
    audience/
      RoomCard.tsx                     # T9 — used by lobby
      DoorPanel.tsx                    # T9 — used by door
  pages/
    EventDashboardPage.tsx             # T3 — per-event hub: rooms grid + nav links
    ScheduleEditorPage.tsx             # T7
    DoorView.tsx                       # T9
    LobbyView.tsx                      # T9
    MessageTemplatesPage.tsx           # T8
  routes.tsx                           # add new routes
```

---

## Task 1: `MessageTemplatesController` — CRUD

**Files:** Create `src/EventStageTimer.Api/Controllers/MessageTemplatesController.cs`

- [ ] **Step 1: Implement controller**

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
[Route("api/events/{eventId:guid}/templates")]
public sealed class MessageTemplatesController(AppDbContext db, IClock clock) : ControllerBase
{
    public sealed record TemplateDto(Guid Id, string Text, int SortOrder);
    public sealed record CreateBody(string Text, int SortOrder);
    public sealed record UpdateBody(string Text, int SortOrder);

    [HttpGet]
    public async Task<IReadOnlyList<TemplateDto>> List(Guid eventId, CancellationToken ct) =>
        await db.MessageTemplates
            .Where(t => t.EventId == eventId)
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Text)
            .Select(t => new TemplateDto(t.Id, t.Text, t.SortOrder))
            .ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "EventAdmin")]
    public async Task<ActionResult<TemplateDto>> Create(Guid eventId, [FromBody] CreateBody body, CancellationToken ct)
    {
        var ev = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (ev is null) return NotFound();
        var t = new MessageTemplate
        {
            Id = Guid.NewGuid(), TenantId = ev.TenantId, EventId = eventId,
            Text = body.Text, SortOrder = body.SortOrder, CreatedAtUtc = clock.UtcNow,
        };
        db.MessageTemplates.Add(t);
        await db.SaveChangesAsync(ct);
        return Ok(new TemplateDto(t.Id, t.Text, t.SortOrder));
    }

    [HttpPut("{templateId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Update(Guid eventId, Guid templateId, [FromBody] UpdateBody body, CancellationToken ct)
    {
        var t = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == templateId && x.EventId == eventId, ct);
        if (t is null) return NotFound();
        t.Text = body.Text;
        t.SortOrder = body.SortOrder;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("{templateId:guid}")]
    [Authorize(Policy = "EventAdmin")]
    public async Task<IActionResult> Delete(Guid eventId, Guid templateId, CancellationToken ct)
    {
        var t = await db.MessageTemplates.FirstOrDefaultAsync(x => x.Id == templateId && x.EventId == eventId, ct);
        if (t is null) return NotFound();
        db.MessageTemplates.Remove(t);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add src/EventStageTimer.Api/Controllers && git commit -m "feat(api): MessageTemplatesController CRUD"
```

---

## Task 2: Public info endpoints (`/r/{code}/info`, `/e/{code}/info`)

**Files:** Modify `src/EventStageTimer.Api/Controllers/PublicTestPingController.cs` → rename + extend.

- [ ] **Step 1: Replace with `PublicInfoController`**

Delete `PublicTestPingController.cs`. Create `src/EventStageTimer.Api/Controllers/PublicInfoController.cs`:

```csharp
using EventStageTimer.Api.Auth.Public;
using EventStageTimer.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EventStageTimer.Api.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = PublicAccessCodeAuthHandler.SchemeName)]
public sealed class PublicInfoController(PublicAccessContext ctx, AppDbContext db) : ControllerBase
{
    public sealed record RoomInfo(Guid RoomId, string RoomName, Guid EventId, string EventName);
    public sealed record LobbyInfo(Guid EventId, string EventName, IReadOnlyList<LobbyRoom> Rooms);
    public sealed record LobbyRoom(Guid Id, string Name);

    [HttpGet("/r/{code}/info")]
    public async Task<ActionResult<RoomInfo>> GetRoom(string code, CancellationToken ct)
    {
        if (ctx.RoomId is not { } rid) return NotFound();
        var info = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.Id == rid)
            .Select(r => new RoomInfo(r.Id, r.Name, r.EventId, r.Event.Name))
            .FirstOrDefaultAsync(ct);
        return info is null ? NotFound() : Ok(info);
    }

    /// <summary>Kept for the test in <c>AccessCodeLookupTests</c> — superseded by /info.</summary>
    [HttpGet("/r/{code}/ping")]
    public IActionResult Ping() => Ok(new { roomId = ctx.RoomId, eventId = ctx.EventId });

    [HttpGet("/e/{code}/info")]
    public async Task<ActionResult<LobbyInfo>> GetLobby(string code, CancellationToken ct)
    {
        if (!ctx.IsLobbyCode || ctx.EventId is not { } eid) return NotFound();
        var ev = await db.Events
            .IgnoreQueryFilters()
            .Where(e => e.Id == eid)
            .Select(e => new { e.Id, e.Name })
            .FirstOrDefaultAsync(ct);
        if (ev is null) return NotFound();
        var rooms = await db.Rooms
            .IgnoreQueryFilters()
            .Where(r => r.EventId == eid)
            .OrderBy(r => r.Name)
            .Select(r => new LobbyRoom(r.Id, r.Name))
            .ToListAsync(ct);
        return Ok(new LobbyInfo(ev.Id, ev.Name, rooms));
    }
}
```

- [ ] **Step 2: Build + commit**

```bash
dotnet build EventStageTimer.sln
git add src/EventStageTimer.Api/Controllers && git commit -m "feat(api): PublicInfoController for /r/{code}/info and /e/{code}/info"
```

---

## Task 3: Per-event dashboard page

**Files:** Create `src/web/src/pages/EventDashboardPage.tsx`. Modify `src/web/src/routes.tsx` and `src/web/src/pages/EventsPage.tsx`.

- [ ] **Step 1: Add a route + page that lists rooms for one event with quick links**

Create `src/web/src/pages/EventDashboardPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { events } from "@/api/events";

export default function EventDashboardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const evQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => events.get(eventId!), enabled: !!eventId });
  const roomsQuery = useQuery({ queryKey: ["rooms", eventId], queryFn: () => events.rooms(eventId!), enabled: !!eventId });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;
  if (evQuery.isLoading || roomsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (evQuery.error || roomsQuery.error) return <div className="p-8 text-red-400">Failed to load.</div>;

  const ev = evQuery.data!;
  const rooms = roomsQuery.data!;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">← All events</Link>
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">{ev.name}</h1>
        <span className="text-sm text-zinc-500">lobby code <code>{ev.lobbyAccessCode}</code></span>
        <Link to={`/e/${formatCode(ev.lobbyAccessCode)}/lobby`} className="text-sm text-blue-400 hover:underline">Open lobby →</Link>
        <Link to={`/events/${ev.id}/templates`} className="text-sm text-blue-400 hover:underline">Templates</Link>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="font-medium text-lg">{r.name}</div>
              <code className="text-xs text-zinc-500">{formatCode(r.accessCode)}</code>
            </div>
            <div className="flex gap-3 text-sm">
              <Link to={`/rooms/${r.id}`} className="text-blue-400 hover:underline">Control →</Link>
              <Link to={`/rooms/${r.id}/schedule`} className="text-blue-400 hover:underline">Schedule</Link>
              <Link to={`/r/${formatCode(r.accessCode)}/speaker`} className="text-blue-400 hover:underline" target="_blank">Speaker</Link>
              <Link to={`/r/${formatCode(r.accessCode)}/door`} className="text-blue-400 hover:underline" target="_blank">Door</Link>
            </div>
          </li>
        ))}
        {rooms.length === 0 && <li className="text-zinc-400">No rooms yet.</li>}
      </ul>
    </div>
  );
}

function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
```

- [ ] **Step 2: Update events list to link to dashboard instead of expanding inline**

Replace the events list rendering in `EventsPage.tsx` so each row links to the per-event dashboard:

```tsx
// Replace the existing button + RoomList expansion with a simple Link
<Link to={`/events/${ev.id}`} className="block w-full p-4 hover:bg-zinc-800/60">
  <div className="font-medium">{ev.name}</div>
  <div className="text-xs text-zinc-400">
    {new Date(ev.startsAtUtc).toLocaleString()} — lobby code {ev.lobbyAccessCode}
  </div>
</Link>
```

(Remove the `RoomList` sub-component, `useState` import for `openEvent`, and the expand/collapse logic.)

- [ ] **Step 3: Add the route**

Edit `src/web/src/routes.tsx` — add inside the array (in the protected section):

```tsx
{ path: "/events/:eventId", element: <ProtectedRoute><EventDashboardPage /></ProtectedRoute> },
```

Plus the import at the top.

- [ ] **Step 4: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): per-event dashboard with room cards + nav links"
```

---

## Task 4: Schedule items API client + thresholds helper

**Files:** Create `src/web/src/api/scheduleItems.ts`. Modify `src/web/src/api/types.ts` if needed.

- [ ] **Step 1: Implement**

Create `src/web/src/api/scheduleItems.ts`:

```ts
import { api } from "./client";
import type { ScheduleItemDto } from "./types";

export interface CreateScheduleItemBody {
  title: string;
  speakerName?: string | null;
  scheduledStartUtc: string;
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholdsJson?: string | null;
}

export const scheduleItems = {
  list: (roomId: string) => api<ScheduleItemDto[]>(`/api/rooms/${roomId}/schedule`),
  create: (roomId: string, body: CreateScheduleItemBody) =>
    api<ScheduleItemDto>(`/api/rooms/${roomId}/schedule`, { method: "POST", body: JSON.stringify(body) }),
  update: (roomId: string, itemId: string, body: CreateScheduleItemBody) =>
    api<void>(`/api/rooms/${roomId}/schedule/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
  reorder: (roomId: string, itemIds: string[]) =>
    api<void>(`/api/rooms/${roomId}/schedule/reorder`, { method: "POST", body: JSON.stringify({ itemIdsInOrder: itemIds }) }),
  remove: (roomId: string, itemId: string) =>
    api<void>(`/api/rooms/${roomId}/schedule/${itemId}`, { method: "DELETE" }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/web/src/api && git commit -m "feat(web): schedule items API client"
```

---

## Task 5: Message templates API client

**Files:** Create `src/web/src/api/messageTemplates.ts`.

- [ ] **Step 1: Implement**

Create `src/web/src/api/messageTemplates.ts`:

```ts
import { api } from "./client";

export interface TemplateDto { id: string; text: string; sortOrder: number }

export const templates = {
  list: (eventId: string) => api<TemplateDto[]>(`/api/events/${eventId}/templates`),
  create: (eventId: string, text: string, sortOrder: number) =>
    api<TemplateDto>(`/api/events/${eventId}/templates`, { method: "POST", body: JSON.stringify({ text, sortOrder }) }),
  update: (eventId: string, templateId: string, text: string, sortOrder: number) =>
    api<void>(`/api/events/${eventId}/templates/${templateId}`, { method: "PUT", body: JSON.stringify({ text, sortOrder }) }),
  remove: (eventId: string, templateId: string) =>
    api<void>(`/api/events/${eventId}/templates/${templateId}`, { method: "DELETE" }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/web && git commit -m "feat(web): message templates API client"
```

---

## Task 6: Public info API client

**Files:** Create `src/web/src/api/publicInfo.ts`.

- [ ] **Step 1: Implement**

Create `src/web/src/api/publicInfo.ts`:

```ts
import { api } from "./client";

export interface RoomInfo { roomId: string; roomName: string; eventId: string; eventName: string }
export interface LobbyInfo { eventId: string; eventName: string; rooms: { id: string; name: string }[] }

export const publicInfo = {
  room: (code: string) => api<RoomInfo>(`/r/${code}/info`),
  lobby: (code: string) => api<LobbyInfo>(`/e/${code}/info`),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/web && git commit -m "feat(web): public info API client"
```

---

## Task 7: Schedule editor page (drag-and-drop + modal form + thresholds)

**Files:**
- Install: `@dnd-kit/core` `@dnd-kit/sortable`
- Create: `src/web/src/components/control/ScheduleEditor.tsx`
- Create: `src/web/src/components/control/ScheduleItemForm.tsx`
- Create: `src/web/src/components/control/ThresholdsEditor.tsx`
- Create: `src/web/src/pages/ScheduleEditorPage.tsx`
- Modify: `src/web/src/routes.tsx`

- [ ] **Step 1: Install dnd-kit**

```bash
cd src/web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities && cd ../..
```

- [ ] **Step 2: ThresholdsEditor**

Create `src/web/src/components/control/ThresholdsEditor.tsx`:

```tsx
import { useState } from "react";
import type { Threshold } from "@/api/types";
import { X } from "lucide-react";

interface Props { value: Threshold[]; onChange: (next: Threshold[]) => void }

const tokenOptions = ["warning", "danger", "final", "primary", "accent"];

export default function ThresholdsEditor({ value, onChange }: Props) {
  const [seconds, setSeconds] = useState("");
  const [token, setToken] = useState("warning");

  function add() {
    const s = parseInt(seconds, 10);
    if (!Number.isFinite(s) || s <= 0) return;
    const next = [...value, { secondsRemaining: s, colorToken: token }]
      .sort((a, b) => b.secondsRemaining - a.secondsRemaining);
    onChange(next);
    setSeconds("");
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {value.map((t, i) => (
          <li key={i} className="flex items-center justify-between rounded bg-zinc-900 px-3 py-1.5 text-sm">
            <span className="font-mono">≤ {t.secondsRemaining}s</span>
            <span className="text-zinc-400">{t.colorToken}</span>
            <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-zinc-300">
              <X className="size-4" />
            </button>
          </li>
        ))}
        {value.length === 0 && <li className="text-xs text-zinc-500">No thresholds. Inherits the event default (none means primary color throughout).</li>}
      </ul>
      <div className="flex gap-2 items-center">
        <input
          type="number" min={1} placeholder="seconds" value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm font-mono" />
        <select value={token} onChange={(e) => setToken(e.target.value)}
          className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm">
          {tokenOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={add} className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Add</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ScheduleItemForm (modal)**

Create `src/web/src/components/control/ScheduleItemForm.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import type { ScheduleItemDto, Threshold } from "@/api/types";
import ThresholdsEditor from "./ThresholdsEditor";

export interface ScheduleItemFormValues {
  title: string;
  speakerName: string;
  scheduledStartLocal: string; // datetime-local
  durationSec: number;
  preRollSec: number;
  autoStart: boolean;
  thresholds: Threshold[];
}

interface Props {
  initial?: ScheduleItemDto;
  onSubmit: (values: ScheduleItemFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function ScheduleItemForm({ initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ScheduleItemFormValues>(() => initialValuesFrom(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try { await onSubmit(values); }
    catch (err) { setError(String((err as Error).message ?? err)); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
      <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 w-full max-w-xl space-y-4">
        <h2 className="text-lg font-semibold">{initial ? "Edit item" : "New schedule item"}</h2>

        <Field label="Title" value={values.title} onChange={(v) => setValues({ ...values, title: v })} required />
        <Field label="Speaker" value={values.speakerName} onChange={(v) => setValues({ ...values, speakerName: v })} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Scheduled start</span>
            <input
              type="datetime-local" value={values.scheduledStartLocal}
              onChange={(e) => setValues({ ...values, scheduledStartLocal: e.target.value })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration (seconds)</span>
            <input
              type="number" min={1} value={values.durationSec}
              onChange={(e) => setValues({ ...values, durationSec: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 font-mono" required />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Pre-roll (seconds)</span>
            <input
              type="number" min={0} value={values.preRollSec}
              onChange={(e) => setValues({ ...values, preRollSec: parseInt(e.target.value, 10) || 0 })}
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 font-mono" />
          </label>
          <label className="flex items-center gap-2 mt-7">
            <input type="checkbox" checked={values.autoStart}
              onChange={(e) => setValues({ ...values, autoStart: e.target.checked })} />
            <span className="text-sm">Auto-start</span>
          </label>
        </div>

        <div>
          <span className="block text-sm text-zinc-400 mb-2">Color thresholds</span>
          <ThresholdsEditor value={values.thresholds} onChange={(t) => setValues({ ...values, thresholds: t })} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Cancel</button>
          <button type="submit" disabled={submitting} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (s: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800" />
    </label>
  );
}

function initialValuesFrom(item?: ScheduleItemDto): ScheduleItemFormValues {
  if (!item) {
    const now = new Date();
    return {
      title: "",
      speakerName: "",
      scheduledStartLocal: toLocalDateTime(now),
      durationSec: 1800,
      preRollSec: 30,
      autoStart: false,
      thresholds: [],
    };
  }
  return {
    title: item.title,
    speakerName: item.speakerName ?? "",
    scheduledStartLocal: toLocalDateTime(new Date(item.scheduledStartUtc)),
    durationSec: item.durationSec,
    preRollSec: item.preRollSec,
    autoStart: item.autoStart,
    thresholds: item.thresholdsJson ? JSON.parse(item.thresholdsJson) as Threshold[] : [],
  };
}

function toLocalDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 4: ScheduleEditor (drag-drop list)**

Create `src/web/src/components/control/ScheduleEditor.tsx`:

```tsx
import { DndContext, closestCenter, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ScheduleItemDto } from "@/api/types";

interface Props {
  items: ScheduleItemDto[];
  onReorder: (orderedIds: string[]) => void;
  onEdit: (item: ScheduleItemDto) => void;
  onDelete: (item: ScheduleItemDto) => void;
}

export default function ScheduleEditor({ items, onReorder, onEdit, onDelete }: Props) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorder(reordered.map((i) => i.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="rounded border border-zinc-800 divide-y divide-zinc-800">
          {items.map((item) => (
            <SortableRow key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {items.length === 0 && <li className="p-4 text-sm text-zinc-500">No items yet.</li>}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ item, onEdit, onDelete }: { item: ScheduleItemDto; onEdit: (i: ScheduleItemDto) => void; onDelete: (i: ScheduleItemDto) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-zinc-900">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300">
        <GripVertical className="size-5" />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium">{item.title}</div>
        <div className="text-xs text-zinc-500">
          {new Date(item.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·
          {" "}{Math.floor(item.durationSec / 60)} min · pre-roll {item.preRollSec}s
          {item.autoStart && " · auto"}
          {item.speakerName && ` · ${item.speakerName}`}
        </div>
      </div>
      <button onClick={() => onEdit(item)} className="text-zinc-500 hover:text-zinc-300"><Pencil className="size-4" /></button>
      <button onClick={() => onDelete(item)} className="text-zinc-500 hover:text-red-400"><Trash2 className="size-4" /></button>
    </li>
  );
}
```

- [ ] **Step 5: ScheduleEditorPage**

Create `src/web/src/pages/ScheduleEditorPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { scheduleItems, type CreateScheduleItemBody } from "@/api/scheduleItems";
import type { ScheduleItemDto } from "@/api/types";
import ScheduleEditor from "@/components/control/ScheduleEditor";
import ScheduleItemForm, { type ScheduleItemFormValues } from "@/components/control/ScheduleItemForm";

export default function ScheduleEditorPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const qc = useQueryClient();
  const itemsQuery = useQuery({ queryKey: ["schedule", roomId], queryFn: () => scheduleItems.list(roomId!), enabled: !!roomId });

  const [editing, setEditing] = useState<ScheduleItemDto | null>(null);
  const [creating, setCreating] = useState(false);

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => scheduleItems.reorder(roomId!, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const createMutation = useMutation({
    mutationFn: (body: CreateScheduleItemBody) => scheduleItems.create(roomId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateScheduleItemBody }) => scheduleItems.update(roomId!, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduleItems.remove(roomId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule", roomId] }),
  });

  if (!roomId) return <div className="p-8 text-red-400">Missing room id.</div>;
  if (itemsQuery.isLoading) return <div className="p-8">Loading…</div>;
  if (itemsQuery.error) return <div className="p-8 text-red-400">Failed to load schedule.</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <div className="flex gap-3 text-sm">
          <Link to={`/rooms/${roomId}`} className="text-blue-400 hover:underline">Control →</Link>
          <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white">Add item</button>
        </div>
      </div>

      <ScheduleEditor
        items={itemsQuery.data!}
        onReorder={(ids) => reorderMutation.mutate(ids)}
        onEdit={(item) => setEditing(item)}
        onDelete={(item) => { if (confirm(`Delete "${item.title}"?`)) deleteMutation.mutate(item.id); }}
      />

      {creating && (
        <ScheduleItemForm
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => { await createMutation.mutateAsync(toBody(v)); setCreating(false); }}
        />
      )}
      {editing && (
        <ScheduleItemForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => { await updateMutation.mutateAsync({ id: editing.id, body: toBody(v) }); setEditing(null); }}
        />
      )}
    </div>
  );
}

function toBody(v: ScheduleItemFormValues): CreateScheduleItemBody {
  return {
    title: v.title,
    speakerName: v.speakerName.trim() || null,
    scheduledStartUtc: new Date(v.scheduledStartLocal).toISOString(),
    durationSec: v.durationSec,
    preRollSec: v.preRollSec,
    autoStart: v.autoStart,
    thresholdsJson: v.thresholds.length ? JSON.stringify(v.thresholds) : null,
  };
}
```

- [ ] **Step 6: Add the route**

Edit `src/web/src/routes.tsx`:

```tsx
{ path: "/rooms/:roomId/schedule", element: <ProtectedRoute><ScheduleEditorPage /></ProtectedRoute> },
```

- [ ] **Step 7: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): schedule editor with drag-and-drop + modal form + thresholds"
```

---

## Task 8: Message templates page

**Files:** Create `src/web/src/pages/MessageTemplatesPage.tsx`. Modify routes.

- [ ] **Step 1: Page**

Create `src/web/src/pages/MessageTemplatesPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { templates, type TemplateDto } from "@/api/messageTemplates";
import { Pencil, Trash2 } from "lucide-react";

export default function MessageTemplatesPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["templates", eventId], queryFn: () => templates.list(eventId!), enabled: !!eventId });

  const [draft, setDraft] = useState("");
  const create = useMutation({
    mutationFn: () => templates.create(eventId!, draft.trim(), 0),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: ["templates", eventId] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => templates.remove(eventId!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", eventId] }),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const update = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => templates.update(eventId!, id, text, 0),
    onSuccess: () => { setEditingId(null); qc.invalidateQueries({ queryKey: ["templates", eventId] }); },
  });

  if (!eventId) return <div className="p-8 text-red-400">Missing event id.</div>;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Link to={`/events/${eventId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← Event</Link>
      <h1 className="text-2xl font-semibold">Message templates</h1>

      <div className="flex gap-2">
        <input
          value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="New template…"
          className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
        <button
          disabled={!draft.trim()}
          onClick={() => create.mutate()}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">Add</button>
      </div>

      <ul className="rounded border border-zinc-800 divide-y divide-zinc-800">
        {(list.data ?? []).map((t: TemplateDto) => (
          <li key={t.id} className="flex items-center gap-2 p-3">
            {editingId === t.id ? (
              <>
                <input value={editingText} onChange={(e) => setEditingText(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800" />
                <button onClick={() => update.mutate({ id: t.id, text: editingText })}
                  className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm">Save</button>
                <button onClick={() => setEditingId(null)} className="text-zinc-500">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1">{t.text}</span>
                <button onClick={() => { setEditingId(t.id); setEditingText(t.text); }}
                  className="text-zinc-500 hover:text-zinc-300"><Pencil className="size-4" /></button>
                <button onClick={() => { if (confirm(`Delete "${t.text}"?`)) remove.mutate(t.id); }}
                  className="text-zinc-500 hover:text-red-400"><Trash2 className="size-4" /></button>
              </>
            )}
          </li>
        ))}
        {list.data?.length === 0 && <li className="p-3 text-sm text-zinc-500">No templates yet.</li>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add route + nav link**

Add to `routes.tsx`:

```tsx
{ path: "/events/:eventId/templates", element: <ProtectedRoute><MessageTemplatesPage /></ProtectedRoute> },
```

(EventDashboardPage already links to `/events/{id}/templates`.)

- [ ] **Step 3: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): message templates editor"
```

---

## Task 9: Door view + Lobby view

**Files:**
- Create: `src/web/src/components/audience/DoorPanel.tsx`
- Create: `src/web/src/components/audience/RoomCard.tsx`
- Create: `src/web/src/pages/DoorView.tsx`
- Create: `src/web/src/pages/LobbyView.tsx`
- Modify: `src/web/src/routes.tsx`

- [ ] **Step 1: DoorPanel**

Create `src/web/src/components/audience/DoorPanel.tsx`:

```tsx
import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { useEffect, useState } from "react";

interface Props { snapshot: Snapshot; skewMs: number; eventName: string; roomName: string }

export default function DoorPanel({ snapshot, skewMs, eventName, roomName }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 500); return () => clearInterval(id); }, []);

  const status = describeStatus(snapshot, skewMs);

  return (
    <div className="flex flex-col h-full p-10">
      <div className="text-sm uppercase tracking-widest text-zinc-500">{eventName}</div>
      <div className="text-3xl font-semibold mt-2">{roomName}</div>

      <div className="flex-1 flex flex-col justify-center">
        <Section label="Now playing">
          {snapshot.currentItem ? (
            <>
              <div className="text-2xl font-medium">{snapshot.currentItem.title}</div>
              {snapshot.currentItem.speakerName && <div className="text-zinc-400">{snapshot.currentItem.speakerName}</div>}
              <div className="text-zinc-500 mt-2 text-sm">{status}</div>
            </>
          ) : (
            <div className="text-zinc-500 italic">{status}</div>
          )}
        </Section>

        <Section label="Up next">
          {snapshot.nextItem ? (
            <>
              <div className="text-lg">{snapshot.nextItem.title}</div>
              <div className="text-zinc-500 text-sm">{new Date(snapshot.nextItem.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </>
          ) : <div className="text-zinc-500 italic">No upcoming sessions.</div>}
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

function describeStatus(s: Snapshot, skewMs: number): string {
  if (s.phase === "Idle") return "Starting soon";
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) {
    const ms = new Date(s.preRollEndsAtUtc).getTime() - (Date.now() + skewMs);
    return `Starts in ${formatRemaining(ms)}`;
  }
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsed = (Date.now() + skewMs) - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    const remaining = (s.currentItem.durationSec + s.adjustmentSec) * 1000 - elapsed;
    if (remaining > 0) return `${formatRemaining(remaining)} remaining`;
    return `Running over by ${formatRemaining(remaining)}`;
  }
  if (s.phase === "Paused") return "Paused";
  if (s.phase === "Ended") return "Just finished";
  return "";
}
```

- [ ] **Step 2: RoomCard (used by lobby)**

Create `src/web/src/components/audience/RoomCard.tsx`:

```tsx
import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";

interface Props { roomName: string; snapshot: Snapshot | undefined; skewMs: number }

export default function RoomCard({ roomName, snapshot, skewMs }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2">
        <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
        <div className="text-zinc-500 italic">No state yet</div>
      </div>
    );
  }
  const remainingMs = computeRemaining(snapshot, skewMs);
  const color = snapshot.phase === "PreRoll"
    ? "var(--accent)"
    : snapshot.phase === "Running" || snapshot.phase === "Paused"
      ? colorTokenForRemaining(snapshot.currentItem?.thresholds ?? [], remainingMs)
      : "var(--text-muted)";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2">
      <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
      <div className="text-lg font-medium truncate" title={snapshot.currentItem?.title ?? ""}>
        {snapshot.currentItem?.title ?? "Idle"}
      </div>
      {snapshot.currentItem?.speakerName && <div className="text-sm text-zinc-500 truncate">{snapshot.currentItem.speakerName}</div>}
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>
        {snapshot.phase === "Idle" || snapshot.phase === "Ended" ? "—" : formatRemaining(remainingMs)}
      </div>
    </div>
  );
}

function computeRemaining(s: Snapshot, skewMs: number): number {
  const serverNow = Date.now() + skewMs;
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) return new Date(s.preRollEndsAtUtc).getTime() - serverNow;
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsedMs = serverNow - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    return (s.currentItem.durationSec + s.adjustmentSec) * 1000 - elapsedMs;
  }
  if (s.phase === "Paused" && s.pauseRemainingMs != null) return s.pauseRemainingMs;
  return 0;
}
```

- [ ] **Step 3: DoorView page**

Create `src/web/src/pages/DoorView.tsx`:

```tsx
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo } from "@/api/publicInfo";
import { useTimerHub } from "@/hub/useTimerHub";
import DoorPanel from "@/components/audience/DoorPanel";

export default function DoorView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["roomInfo", accessCode], queryFn: () => publicInfo.room(accessCode!), enabled: !!accessCode });
  const { snapshot, skewMs, ready, error } = useTimerHub(info.data?.roomId ?? null, normalised);

  if (info.error) return <Center>URL not valid</Center>;
  if (!info.data || !ready || !snapshot) return <Center>Connecting…</Center>;
  if (error) return <Center>Connection error: {error.message}</Center>;

  return <div className="w-full h-full"><DoorPanel snapshot={snapshot} skewMs={skewMs} eventName={info.data.eventName} roomName={info.data.roomName} /></div>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center w-full h-full text-zinc-500">{children}</div>;
}
```

- [ ] **Step 4: LobbyView page**

Create `src/web/src/pages/LobbyView.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicInfo } from "@/api/publicInfo";
import { TimerHub } from "@/hub/timerHub";
import type { Snapshot } from "@/api/types";
import { measureSkew } from "@/lib/clockSkew";
import RoomCard from "@/components/audience/RoomCard";

export default function LobbyView() {
  const { accessCode } = useParams<{ accessCode: string }>();
  const normalised = (accessCode ?? "").replace("-", "").toUpperCase();
  const info = useQuery({ queryKey: ["lobbyInfo", accessCode], queryFn: () => publicInfo.lobby(accessCode!), enabled: !!accessCode });

  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [skewMs, setSkewMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!info.data || !accessCode) return;
    let cancelled = false;
    const hub = new TimerHub(normalised);
    const off = hub.onSnapshot((snap) => {
      if (cancelled) return;
      setSnapshots((prev) => ({ ...prev, [snap.roomId]: snap }));
      setSkewMs(measureSkew(snap.serverNowUtc));
    });
    hub.start().then(() => { if (!cancelled) setReady(true); }).catch((e) => { if (!cancelled) setError(e as Error); });
    return () => { cancelled = true; off(); hub.stop().catch(() => {}); };
  }, [info.data, accessCode, normalised]);

  if (info.error) return <Center>URL not valid</Center>;
  if (!info.data || !ready) return <Center>Connecting…</Center>;
  if (error) return <Center>Connection error: {error.message}</Center>;

  return (
    <div className="p-8 h-full overflow-auto">
      <div className="text-sm uppercase tracking-widest text-zinc-500">{info.data.eventName}</div>
      <h1 className="text-3xl font-semibold mb-6">Lobby</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {info.data.rooms.map((r) => (
          <RoomCard key={r.id} roomName={r.name} snapshot={snapshots[r.id]} skewMs={skewMs} />
        ))}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center w-full h-full text-zinc-500">{children}</div>;
}
```

- [ ] **Step 5: Routes + replace Speaker resolver to use new info endpoint**

Edit `routes.tsx`:

```tsx
{ path: "/r/:accessCode/door", element: <DoorView /> },
{ path: "/e/:accessCode/lobby", element: <LobbyView /> },
```

Update `SpeakerView.tsx` to use the new `/r/{code}/info` endpoint instead of `/ping`:

```tsx
// Replace the fetch(`/r/${accessCode}/ping`) block with:
import { publicInfo } from "@/api/publicInfo";
// ... in useEffect:
publicInfo.room(accessCode)
  .then((info) => setRoomId(info.roomId))
  .catch((e) => setResolveError(String((e as Error).message ?? e)));
```

- [ ] **Step 6: Build + commit**

```bash
cd src/web && npm run build && cd ../..
git add src/web && git commit -m "feat(web): door view + lobby view + speaker view uses /info"
```

---

## Task 10: Integration test for `MessageTemplatesController`

**Files:** Create `tests/EventStageTimer.Api.Tests/Templates/MessageTemplatesTests.cs`

- [ ] **Step 1: Test**

```csharp
using EventStageTimer.Api.Tests.Fixtures;
using EventStageTimer.Api.Tests.Helpers;
using FluentAssertions;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace EventStageTimer.Api.Tests.Templates;

[Collection("sqlserver")]
public sealed class MessageTemplatesTests(SqlServerFixture sql) : IAsyncLifetime
{
    private TestApiFactory _factory = null!;
    private HttpClient _http = null!;

    public Task InitializeAsync() { _factory = new TestApiFactory(sql); _http = _factory.CreateRecordingClient(); return Task.CompletedTask; }
    public Task DisposeAsync() { _http.Dispose(); _factory.Dispose(); return Task.CompletedTask; }

    [Fact]
    public async Task EventAdmin_can_create_list_update_delete_templates()
    {
        var seeded = await TestSeed.CreateAsync(_factory, _http);

        // Create
        var created = await _http.PostAsJsonAsync($"/api/events/{seeded.EventId}/templates", new { Text = "Wrap up", SortOrder = 0 });
        created.EnsureSuccessStatusCode();
        var doc = await created.Content.ReadFromJsonAsync<JsonElement>();
        var templateId = doc.GetProperty("id").GetGuid();

        // List
        var list = await _http.GetFromJsonAsync<JsonElement>($"/api/events/{seeded.EventId}/templates");
        list.GetArrayLength().Should().Be(1);
        list[0].GetProperty("text").GetString().Should().Be("Wrap up");

        // Update
        var updated = await _http.PutAsJsonAsync($"/api/events/{seeded.EventId}/templates/{templateId}", new { Text = "5 min over", SortOrder = 1 });
        updated.EnsureSuccessStatusCode();

        // Delete
        var deleted = await _http.DeleteAsync($"/api/events/{seeded.EventId}/templates/{templateId}");
        deleted.EnsureSuccessStatusCode();

        var listAfter = await _http.GetFromJsonAsync<JsonElement>($"/api/events/{seeded.EventId}/templates");
        listAfter.GetArrayLength().Should().Be(0);
    }
}
```

- [ ] **Step 2: Run + commit**

```bash
dotnet test tests/EventStageTimer.Api.Tests --filter "FullyQualifiedName~MessageTemplatesTests"
git add tests && git commit -m "test: MessageTemplatesController CRUD integration test"
```

---

## Task 11: Final smoke + PROGRESS update

- [ ] **Step 1: Full test suite**

```bash
dotnet test EventStageTimer.sln
(cd src/web && npm test -- --run)
```

Expected: all green.

- [ ] **Step 2: SPA build + manual smoke checklist**

```bash
(cd src/web && npm run build)
# (start SQL + seed + run API)
```

Open in browser:
- `/` → events list → click an event → dashboard
- Dashboard → Schedule → drag to reorder → Add item → fill form → Save
- Dashboard → Templates → add/edit/delete
- Dashboard → click Door link → see "Up next" + "Now playing"
- Dashboard → click Lobby link → grid of rooms with live countdowns

- [ ] **Step 3: Update PROGRESS.md, commit**

---

## Spec coverage map

| Spec section | Where implemented |
|---|---|
| §4.1 Schedule editor (drag-drop, thresholds) | T7 |
| §4.1 Message templates CRUD | T1 (api), T8 (ui) |
| §4.3 Door view | T9 |
| §4.4 Lobby view | T9 |
| §11 Public info | T2 (api), T6 (client) |
| §10 Branding tokens override | Plan 4 |
| §4.1 Members + invitations | Plan 4 |
