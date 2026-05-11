# UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the operator-facing UX from "admin tool" to "product an event manager would trust on show day." Three coordinated tracks: (A) strip developer-facing artifacts from the UI and add the missing "create event" flow, (B) build the persistent app shell, transport-controls hierarchy, keyboard shortcuts, access-code-rotation safety, and humane error mapping that make the control surface usable under pressure, and (C) add the motion, feedback, and loading polish that make the product feel alive.

**Architecture:** Pure frontend changes in `src/web/`. No domain or hub work is required — `POST /api/events` already exists (`EventsController.cs:42-75`), and the connected-client counter for the access-code rotation sheet is **deliberately out of scope** in v1 (would require hub-side presence tracking + backplane-safe registry; deferred). All new behavior is layered on top of existing TanStack Query + SignalR plumbing. Five shared UI primitives (`Sheet`, `ConfirmDialog`, `Toast`, `Button`, `Skeleton`) are built first and then adopted across all surfaces.

**Tech Stack:** React 19, TypeScript 6 (`~6.0.2`), Vite 8, Tailwind 4, react-router 7, @tanstack/react-query 5, @microsoft/signalr 10, zustand 5, lucide-react, vitest 4, @testing-library/react 16.

**Audit reference:** `2026-05-11` Apple HIG audit (conversation context). Pakket 1 = Phase 1, Pakket 2 = Phase 2, Pakket 3 = Phase 3.

---

## File structure

### New files

```
src/web/src/
  components/
    ui/
      Sheet.tsx                       # Modal primitive: focus trap, Esc/Cmd-Enter, backdrop
      ConfirmDialog.tsx               # Built on Sheet — replaces window.confirm()
      Toast.tsx                       # Toast + ToastProvider + useToast hook
      Button.tsx                      # Primary/secondary/ghost/danger variants
      Skeleton.tsx                    # Single skeleton block primitive
      SkeletonRow.tsx                 # Composed skeleton for list rows
    shell/
      AppShell.tsx                    # Top bar + main pane wrapper
      EventContextBar.tsx             # Current event name + Run/Setup tabs + sign-out menu
    events/
      CreateEventSheet.tsx            # + New event form
    control/
      CueStrip.tsx                    # Persistent "next cue" strip on room control
      TransportControlsV2.tsx         # Rewritten hierarchy (dominant Start + overflow)
      ShortcutsOverlay.tsx            # ? help overlay
    branding/
      ThemeTokenEditor.tsx            # Replaces JSON textarea
      TokenSwatch.tsx                 # One row of the theme editor
  hooks/
    useShortcuts.ts                   # Keyboard-shortcut hook
    useUndoToast.ts                   # Wires destructive mutations to undo toasts
  lib/
    roleLabels.ts                     # PascalCase enum → human label mapping
    slug.ts                           # Org name → slug derivation
    hubErrors.ts                      # Map SignalR error strings → humane copy
    apiErrors.ts                      # Map ApiError → humane copy
  test/
    sheet.test.tsx
    confirmDialog.test.tsx
    toast.test.tsx
    roleLabels.test.ts
    slug.test.ts
    hubErrors.test.ts
    apiErrors.test.ts
    useShortcuts.test.tsx
```

### Modified files

```
src/web/src/
  App.tsx                                  # Wrap RouterProvider in ToastProvider
  styles/globals.css                       # New message-bg default, transitions, focus ring
  theme/defaults.ts                        # Update message-bg default
  routes.tsx                               # Wrap protected routes in AppShell
  pages/
    SignInPage.tsx                         # Humane error mapping
    SetupPage.tsx                          # Hide slug, auto-derive, auto sign-in after
    EventsPage.tsx                         # Empty state + Create Event sheet
    EventDashboardPage.tsx                 # Use new ConfirmDialog + Toast for code rotation
    RoomControlPage.tsx                    # CueStrip + TransportControlsV2 + shortcuts
    ScheduleEditorPage.tsx                 # ConfirmDialog for delete
    BrandingPage.tsx                       # Replace JSON textarea + token labels
    MembersPage.tsx                        # Role labels + ConfirmDialog
    MessageTemplatesPage.tsx               # ConfirmDialog + empty state
    AuditPage.tsx                          # (out of scope)
  components/
    ProtectedRoute.tsx                     # Wrap children in AppShell
    timer/
      Countdown.tsx                        # Phase transition animation, final-10s pulse
      MessageOverlay.tsx                   # Slide+fade animation
    audience/
      RoomCard.tsx                         # Phase-color crossfade
  pages/
    SpeakerView.tsx                        # Branded "Connecting…" state
    DoorView.tsx                           # Branded "Connecting…" state
    LobbyView.tsx                          # Branded "Connecting…" state
    NotFoundPage.tsx                       # Real empty state
  hub/
    timerHub.ts                            # Error normalization
```

### Out of scope (documented, deferred)

- Hub-side connected-client presence tracking (needed for live count in rotation sheet).
- Cmd-K command palette (large; separate plan).
- Date picker replacement (FP-09 is "Medium" priority; native `datetime-local` stays for v1).
- Audit page rewrite (FP-20 is "Low" priority).
- Mobile/touch-target audit (FP-10 in 5.10 — separate plan).
- Accessibility audit beyond focus rings + aria-live on countdown (FP-15 — separate plan).

---

## Phase 0 — Shared primitives

These are dependencies for every later task. Build them first, with tests, then adopt them.

### Task 0.1: `Sheet` primitive (modal with focus trap, Esc, Cmd-Enter)

**Files:**
- Create: `src/web/src/components/ui/Sheet.tsx`
- Create: `src/web/src/test/sheet.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/web/src/test/sheet.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sheet from "@/components/ui/Sheet";

describe("Sheet", () => {
  it("renders children when open", () => {
    render(<Sheet open onClose={() => {}}><div>body</div></Sheet>);
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<Sheet open={false} onClose={() => {}}><div>body</div></Sheet>);
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("calls onClose when Esc is pressed", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose}><div>body</div></Sheet>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose}><div>body</div></Sheet>);
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when the panel itself is clicked", () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose}><div>body</div></Sheet>);
    fireEvent.click(screen.getByTestId("sheet-panel"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("autofocuses the first focusable element on open", () => {
    render(
      <Sheet open onClose={() => {}}>
        <input data-testid="first-input" />
        <button>second</button>
      </Sheet>,
    );
    expect(screen.getByTestId("first-input")).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/sheet.test.tsx`
Expected: FAIL with "Cannot find module @/components/ui/Sheet".

- [ ] **Step 3: Implement `Sheet`**

```tsx
// src/web/src/components/ui/Sheet.tsx
import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** When true, Cmd/Ctrl-Enter inside the sheet triggers `onConfirm`. */
  onConfirm?: () => void;
  /** Max width of the sheet panel. Default: 32rem. */
  maxWidth?: string;
}

export default function Sheet({ open, onClose, onConfirm, children, maxWidth = "32rem" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Autofocus the first focusable element on open.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'input, button, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  // Esc → close. Cmd/Ctrl-Enter → confirm (if provided).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (onConfirm && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  return (
    <div
      data-testid="sheet-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
    >
      <div
        ref={panelRef}
        data-testid="sheet-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="w-full max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/sheet.test.tsx`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/web/src/components/ui/Sheet.tsx src/web/src/test/sheet.test.tsx
git commit -m "feat(web): add Sheet primitive with focus trap, Esc, Cmd-Enter"
```

---

### Task 0.2: `ConfirmDialog` primitive (replaces window.confirm)

**Files:**
- Create: `src/web/src/components/ui/ConfirmDialog.tsx`
- Create: `src/web/src/test/confirmDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/web/src/test/confirmDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders title, message and the two buttons", () => {
    render(
      <ConfirmDialog
        open
        title="Delete item"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Delete item")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="t" message="m" confirmLabel="OK" onConfirm={onConfirm} onCancel={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="t" message="m" confirmLabel="OK" onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses red styling when tone is danger", () => {
    render(
      <ConfirmDialog
        open
        tone="danger"
        title="t"
        message="m"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toMatch(/bg-red-/);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/confirmDialog.test.tsx`
Expected: FAIL with "Cannot find module @/components/ui/ConfirmDialog".

- [ ] **Step 3: Implement `ConfirmDialog`**

```tsx
// src/web/src/components/ui/ConfirmDialog.tsx
import type { ReactNode } from "react";
import Sheet from "./Sheet";

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel = "Cancel",
  tone = "default", onConfirm, onCancel,
}: Props) {
  const confirmClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-500 focus-visible:ring-red-400"
      : "bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400";

  return (
    <Sheet open={open} onClose={onCancel} onConfirm={onConfirm} maxWidth="28rem">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-zinc-300">{message}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded px-3 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/confirmDialog.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/web/src/components/ui/ConfirmDialog.tsx src/web/src/test/confirmDialog.test.tsx
git commit -m "feat(web): add ConfirmDialog primitive on top of Sheet"
```

---

### Task 0.3: `Toast` system (with `useToast` hook and Undo toast)

**Files:**
- Create: `src/web/src/components/ui/Toast.tsx`
- Create: `src/web/src/test/toast.test.tsx`
- Modify: `src/web/src/App.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/web/src/test/toast.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function Harness({ onClick }: { onClick: (fns: ReturnType<typeof useToast>) => void }) {
  const t = useToast();
  return <button onClick={() => onClick(t)}>fire</button>;
}

describe("Toast", () => {
  it("shows a toast and auto-dismisses after the timeout", async () => {
    vi.useFakeTimers();
    let api: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onClick={(fns) => { api = fns; }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    act(() => { api!.show({ message: "Saved", timeoutMs: 1000 }); });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("invokes the undo action when Undo is clicked", () => {
    let api: ReturnType<typeof useToast>;
    const undo = vi.fn();
    render(
      <ToastProvider>
        <Harness onClick={(fns) => { api = fns; }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("fire"));
    act(() => { api!.show({ message: "Deleted", action: { label: "Undo", onClick: undo } }); });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/toast.test.tsx`
Expected: FAIL with "Cannot find module @/components/ui/Toast".

- [ ] **Step 3: Implement `Toast`, `ToastProvider`, `useToast`**

```tsx
// src/web/src/components/ui/Toast.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface ToastAction { label: string; onClick: () => void }
interface ToastSpec {
  message: string;
  tone?: "default" | "error";
  action?: ToastAction;
  /** Auto-dismiss timeout in ms. Default 4000. Pass 0 to disable. */
  timeoutMs?: number;
}

interface InternalToast extends ToastSpec { id: number }

interface ToastApi {
  show: (spec: ToastSpec) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<InternalToast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((spec: ToastSpec) => {
    const id = ++idRef.current;
    const next: InternalToast = { ...spec, id };
    setToasts((prev) => [...prev, next]);
    const timeout = spec.timeoutMs ?? 4000;
    if (timeout > 0) setTimeout(() => dismiss(id), timeout);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: InternalToast; onDismiss: () => void }) {
  // Slide+fade in on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const bg = toast.tone === "error" ? "bg-red-700" : "bg-zinc-800";
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-3 rounded-lg ${bg} px-4 py-2 shadow-lg transition duration-200 ease-out ${
        mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <span className="text-sm text-white">{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onDismiss(); }}
          className="rounded px-2 py-1 text-sm font-medium text-blue-300 hover:text-blue-200"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire `ToastProvider` into `App.tsx`**

Edit `src/web/src/App.tsx` to wrap the router:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { ToastProvider } from "./components/ui/Toast";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/toast.test.tsx`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/components/ui/Toast.tsx src/web/src/test/toast.test.tsx src/web/src/App.tsx
git commit -m "feat(web): add Toast system with undo support, wire ToastProvider"
```

---

### Task 0.4: `Button` shared primitive

**Files:**
- Create: `src/web/src/components/ui/Button.tsx`

(No new test file — Button is a thin styling wrapper. We rely on existing pages' tests + visual verification. Add tests if behavior creeps in later.)

- [ ] **Step 1: Implement `Button`**

```tsx
// src/web/src/components/ui/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white focus-visible:ring-blue-400",
  secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 focus-visible:ring-zinc-500",
  danger: "bg-red-600 hover:bg-red-500 text-white focus-visible:ring-red-400",
  ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300 focus-visible:ring-zinc-500",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs gap-1",
  md: "px-3 py-2 text-sm gap-2",
  lg: "px-5 py-3 text-base gap-2",
};

export default function Button({
  variant = "primary", size = "md",
  leadingIcon, trailingIcon, className = "",
  children, ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded font-medium transition-all duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd src/web && npm run build`
Expected: typecheck succeeds (compilation + bundle).

- [ ] **Step 3: Commit**

```bash
git add src/web/src/components/ui/Button.tsx
git commit -m "feat(web): add Button primitive with variants, sizes, press feedback"
```

---

### Task 0.5: `Skeleton` primitives

**Files:**
- Create: `src/web/src/components/ui/Skeleton.tsx`
- Create: `src/web/src/components/ui/SkeletonRow.tsx`

- [ ] **Step 1: Implement `Skeleton`**

```tsx
// src/web/src/components/ui/Skeleton.tsx
interface Props {
  className?: string;
}

export default function Skeleton({ className = "" }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-zinc-800/60 ${className}`}
    />
  );
}
```

- [ ] **Step 2: Implement `SkeletonRow`**

```tsx
// src/web/src/components/ui/SkeletonRow.tsx
import Skeleton from "./Skeleton";

interface Props {
  /** Number of rows to render. Default 3. */
  count?: number;
}

export default function SkeletonRow({ count = 3 }: Props) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src/components/ui/Skeleton.tsx src/web/src/components/ui/SkeletonRow.tsx
git commit -m "feat(web): add Skeleton primitives for loading states"
```

---

## Phase 1 — Stop being an admin tool

Visible-result tasks. Each adopts a Phase 0 primitive plus removes one developer-facing artifact.

### Task 1.1: Map role enums to human labels

**Files:**
- Create: `src/web/src/lib/roleLabels.ts`
- Create: `src/web/src/test/roleLabels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/web/src/test/roleLabels.test.ts
import { describe, it, expect } from "vitest";
import { roleLabel, roleDescription } from "@/lib/roleLabels";

describe("roleLabel", () => {
  it("maps EventAdmin to 'Event admin'", () => {
    expect(roleLabel("EventAdmin")).toBe("Event admin");
  });
  it("maps RoomOperator to 'Room operator'", () => {
    expect(roleLabel("RoomOperator")).toBe("Room operator");
  });
  it("maps Viewer to 'Viewer'", () => {
    expect(roleLabel("Viewer")).toBe("Viewer");
  });
});

describe("roleDescription", () => {
  it("returns a short human description for each role", () => {
    expect(roleDescription("EventAdmin")).toMatch(/manage.*event/i);
    expect(roleDescription("RoomOperator")).toMatch(/control/i);
    expect(roleDescription("Viewer")).toMatch(/read[- ]?only|view/i);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/roleLabels.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/lib/roleLabels.ts
import type { EventRoleName } from "@/api/members";

const LABELS: Record<EventRoleName, string> = {
  EventAdmin: "Event admin",
  RoomOperator: "Room operator",
  Viewer: "Viewer",
};

const DESCRIPTIONS: Record<EventRoleName, string> = {
  EventAdmin: "Can manage the event, rooms, members and settings.",
  RoomOperator: "Can control the timer in assigned rooms during the event.",
  Viewer: "Read-only access to the event and its rooms.",
};

export function roleLabel(role: EventRoleName): string {
  return LABELS[role];
}

export function roleDescription(role: EventRoleName): string {
  return DESCRIPTIONS[role];
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/roleLabels.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Use in `MembersPage.tsx`**

Modify `src/web/src/pages/MembersPage.tsx` — replace the two `<select>` blocks and the inline `inv.role` rendering:

```tsx
// Top of file, add import:
import { roleLabel, roleDescription } from "@/lib/roleLabels";

// Replace the role select inside the Invite section:
<select value={role} onChange={(e) => setRole(e.target.value as EventRoleName)}
  className="px-3 py-2 rounded bg-zinc-900 border border-zinc-800">
  <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
  <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
  <option value="Viewer">{roleLabel("Viewer")}</option>
</select>
{/* Add a description line beneath: */}
<p className="text-xs text-zinc-500 w-full">{roleDescription(role)}</p>

// Replace the pending invitations role line:
<div className="text-sm">{inv.email} <span className="text-zinc-500">· {roleLabel(inv.role)}</span></div>

// Replace the member role select:
<select value={m.role}
  onChange={(e) => updateRole.mutate({ id: m.id, r: e.target.value as EventRoleName })}
  className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-sm">
  <option value="EventAdmin">{roleLabel("EventAdmin")}</option>
  <option value="RoomOperator">{roleLabel("RoomOperator")}</option>
  <option value="Viewer">{roleLabel("Viewer")}</option>
</select>
```

- [ ] **Step 6: Visual verify**

Run dev server: `cd src/web && npm run dev`
Open `http://localhost:5173/events/<id>/members`. Confirm all dropdowns + lists show humane labels.

- [ ] **Step 7: Commit**

```bash
git add src/web/src/lib/roleLabels.ts src/web/src/test/roleLabels.test.ts src/web/src/pages/MembersPage.tsx
git commit -m "feat(web): humane role labels, replace PascalCase enums in members UI"
```

---

### Task 1.2: Hide tenant slug in `SetupPage` + auto-derive

**Files:**
- Create: `src/web/src/lib/slug.ts`
- Create: `src/web/src/test/slug.test.ts`
- Modify: `src/web/src/pages/SetupPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/web/src/test/slug.test.ts
import { describe, it, expect } from "vitest";
import { deriveSlug } from "@/lib/slug";

describe("deriveSlug", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(deriveSlug("My Organisation")).toBe("my-organisation");
  });
  it("strips punctuation", () => {
    expect(deriveSlug("Acme, Inc.")).toBe("acme-inc");
  });
  it("collapses consecutive separators", () => {
    expect(deriveSlug("Foo  --  Bar")).toBe("foo-bar");
  });
  it("trims leading and trailing separators", () => {
    expect(deriveSlug("  -Foo-  ")).toBe("foo");
  });
  it("falls back to 'org' for empty input", () => {
    expect(deriveSlug("")).toBe("org");
    expect(deriveSlug("   ")).toBe("org");
  });
  it("transliterates simple accents", () => {
    expect(deriveSlug("Café")).toBe("cafe");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/slug.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/lib/slug.ts
export function deriveSlug(name: string): string {
  const normalised = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip combining marks (transliterate accents)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalised.length === 0 ? "org" : normalised;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/slug.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Rewrite `SetupPage.tsx`**

Replace the entire body of `SetupPage.tsx`:

```tsx
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { deriveSlug } from "@/lib/slug";
import Button from "@/components/ui/Button";

export default function SetupPage() {
  const nav = useNavigate();
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const [orgName, setOrgName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerDisplayName, setOwnerDisplayName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slugOverride, setSlugOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tenantSlug = slugOverride ?? deriveSlug(orgName);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.setupInitialize({
        tenantName: orgName,
        tenantSlug,
        ownerEmail,
        ownerPassword,
        ownerDisplayName,
      });
      // Auto sign-in so the user lands on /events without re-entering credentials.
      await auth.signIn(ownerEmail, ownerPassword);
      setSignedIn(ownerEmail);
      nav("/");
    } catch (err) {
      setError((err as Error).message || "Setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2">Welcome to Stagecue</h1>
      <p className="text-sm text-zinc-400 mb-6">Set up your organization and admin account to get started.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Organization name" value={orgName} onChange={setOrgName} required autoFocus />
        <Field label="Your email" type="email" value={ownerEmail} onChange={setOwnerEmail} required />
        <Field label="Choose a password" type="password" value={ownerPassword} onChange={setOwnerPassword} required />
        <Field label="Your name" value={ownerDisplayName} onChange={setOwnerDisplayName} required />

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-xs text-zinc-500 hover:text-zinc-300 underline"
        >
          {showAdvanced ? "Hide" : "Show"} advanced
        </button>
        {showAdvanced && (
          <Field
            label="URL identifier"
            value={tenantSlug}
            onChange={(v) => setSlugOverride(v)}
          />
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button type="submit" disabled={submitting || !orgName || !ownerEmail || !ownerPassword} className="w-full">
          {submitting ? "Setting up…" : "Get started"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required = false, autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-zinc-400 mb-1">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
      />
    </label>
  );
}
```

- [ ] **Step 6: Manual verify**

```bash
docker compose down -v  # reset DB
docker compose up --build -d
```

Open `http://localhost:8080/setup`. Confirm: no "Tenant slug" field by default; after submit the user lands at `/` signed in, not at `/signin`.

- [ ] **Step 7: Commit**

```bash
git add src/web/src/lib/slug.ts src/web/src/test/slug.test.ts src/web/src/pages/SetupPage.tsx
git commit -m "feat(web): SetupPage auto-derives slug, auto-signs-in after initialize"
```

---

### Task 1.3: Replace Branding JSON textarea with a visual editor + friendly token labels

**Files:**
- Create: `src/web/src/components/branding/ThemeTokenEditor.tsx`
- Modify: `src/web/src/pages/BrandingPage.tsx`
- Modify: `src/web/src/theme/defaults.ts` — add token metadata

- [ ] **Step 1: Add token metadata in `theme/defaults.ts`**

Replace `defaults.ts` with:

```ts
// src/web/src/theme/defaults.ts
export interface TokenSpec {
  /** Internal key used by CSS variables and the API. */
  key: string;
  /** Human-friendly label for the editor. */
  label: string;
  /** Default value. */
  value: string;
  /** Section heading. */
  group: "Background" | "Text" | "Brand" | "Status" | "Message";
  /** Short description shown beneath the swatch. */
  description?: string;
}

export const tokenSpecs: TokenSpec[] = [
  { key: "bg", label: "Background", value: "#0a0a0a", group: "Background" },
  { key: "surface", label: "Card surface", value: "#161618", group: "Background" },
  { key: "text-primary", label: "Body text", value: "#e8e8e8", group: "Text" },
  { key: "text-muted", label: "Muted text", value: "#aaaaaa", group: "Text" },
  { key: "primary", label: "Brand color", value: "#2ecc71", group: "Brand", description: "Used for primary actions and the countdown above all thresholds." },
  { key: "accent", label: "Accent", value: "#8ab4f8", group: "Brand", description: "Used for pre-roll countdowns and links." },
  { key: "warning", label: "Warning", value: "#c9b380", group: "Status", description: "Used by the warning threshold on the countdown." },
  { key: "danger", label: "Danger", value: "#e67e22", group: "Status", description: "Used by the danger threshold on the countdown." },
  { key: "final", label: "Final", value: "#f1c40f", group: "Status", description: "Used by the final threshold on the countdown." },
  { key: "overrun", label: "Overrun", value: "#e74c3c", group: "Status", description: "Used when a session runs past its allotted time." },
  { key: "message-bg", label: "Message background", value: "#c9b380", group: "Message", description: "Background of speaker messages. Avoid alarm-red unless used for emergencies." },
  { key: "message-text", label: "Message text", value: "#0a0a0a", group: "Message" },
];

// Keep the old export shape for any code still importing it.
export const defaultTheme: Record<string, string> = Object.fromEntries(
  tokenSpecs.map((t) => [t.key, t.value]),
);
```

Note: `message-bg` default changed from `#c0392b` (alarm red) to `#c9b380` (warm amber). `message-text` flips to dark on the lighter background.

- [ ] **Step 2: Implement `ThemeTokenEditor`**

```tsx
// src/web/src/components/branding/ThemeTokenEditor.tsx
import { tokenSpecs, type TokenSpec } from "@/theme/defaults";

interface Props {
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

const groupOrder: TokenSpec["group"][] = ["Brand", "Status", "Message", "Background", "Text"];

export default function ThemeTokenEditor({ overrides, onChange }: Props) {
  const grouped = groupOrder.map((g) => ({ group: g, tokens: tokenSpecs.filter((t) => t.group === g) }));

  function setToken(key: string, value: string) {
    onChange({ ...overrides, [key]: value });
  }
  function clearToken(key: string) {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ group, tokens }) => (
        <section key={group}>
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">{group}</h3>
          <ul className="space-y-2">
            {tokens.map((t) => {
              const current = overrides[t.key] ?? t.value;
              const isOverridden = overrides[t.key] !== undefined;
              return (
                <li key={t.key} className="flex items-start gap-3 rounded border border-zinc-800 bg-zinc-900 p-3">
                  <input
                    type="color"
                    value={current}
                    onChange={(e) => setToken(t.key, e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-zinc-800 bg-transparent"
                    aria-label={`${t.label} color`}
                  />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <label className="text-sm font-medium">{t.label}</label>
                      <input
                        type="text"
                        value={current}
                        onChange={(e) => setToken(t.key, e.target.value)}
                        className="w-28 rounded bg-zinc-950 border border-zinc-800 px-2 py-1 font-mono text-xs"
                      />
                    </div>
                    {t.description && <p className="mt-1 text-xs text-zinc-500">{t.description}</p>}
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => clearToken(t.key)}
                        className="mt-1 text-xs text-zinc-500 hover:text-zinc-300 underline"
                      >
                        Reset to default ({t.value})
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the relevant sections of `BrandingPage.tsx`**

Find the existing `<section>` containing "Theme tokens" and the JSON thresholds textarea, replace both:

```tsx
// imports — add:
import ThemeTokenEditor from "@/components/branding/ThemeTokenEditor";
import ThresholdsEditor from "@/components/control/ThresholdsEditor";
import type { Threshold } from "@/api/types";

// Inside the component, after parsing get.data, add a parsed thresholds state:
const [defaultThresholds, setDefaultThresholds] = useState<Threshold[]>([]);

// Replace the existing useEffect with:
useEffect(() => {
  if (!get.data) return;
  try {
    const parsed = JSON.parse(get.data.themeJson);
    setOverrides(parsed && typeof parsed === "object" ? parsed : {});
  } catch { setOverrides({}); }
  try {
    const parsed = JSON.parse(get.data.defaultThresholdsJson || "[]");
    setDefaultThresholds(Array.isArray(parsed) ? parsed : []);
  } catch { setDefaultThresholds([]); }
}, [get.data]);

// Replace the "Theme tokens" section with:
<section className="space-y-2">
  <h2 className="text-sm uppercase tracking-widest text-zinc-500">Theme</h2>
  <p className="text-xs text-zinc-500">Override only the colors you want changed; the rest fall back to defaults.</p>
  <ThemeTokenEditor overrides={overrides} onChange={setOverrides} />
</section>

// Replace the "Default thresholds (JSON)" section with:
<section className="space-y-2">
  <h2 className="text-sm uppercase tracking-widest text-zinc-500">Default thresholds</h2>
  <p className="text-xs text-zinc-500">Schedule items inherit these colors unless they override them.</p>
  <ThresholdsEditor value={defaultThresholds} onChange={setDefaultThresholds} />
</section>

// Update the save button onClick to serialise from defaultThresholds:
onClick={() => save.mutate({
  themeJson: JSON.stringify(overrides),
  defaultThresholdsJson: JSON.stringify(defaultThresholds),
})}
```

- [ ] **Step 4: Type-check + visual verify**

Run: `cd src/web && npm run build`
Expected: succeeds.

Run dev: `npm run dev`. Visit `/events/<id>/branding`. Verify: no JSON textarea visible anywhere; the token editor is grouped; thresholds use the visual editor. Save persists correctly.

- [ ] **Step 5: Commit**

```bash
git add src/web/src/theme/defaults.ts src/web/src/components/branding/ThemeTokenEditor.tsx src/web/src/pages/BrandingPage.tsx
git commit -m "feat(web): replace Branding JSON textarea with visual token + threshold editors"
```

---

### Task 1.4: + New event sheet on EventsPage

**Files:**
- Create: `src/web/src/components/events/CreateEventSheet.tsx`
- Modify: `src/web/src/pages/EventsPage.tsx`

Backend note: `POST /api/events` exists (`EventsController.cs:42`), accepts `{ Name, TimeZone, StartsAtUtc, EndsAtUtc }`. `events.create()` is already wired in `api/events.ts`.

- [ ] **Step 1: Implement `CreateEventSheet`**

```tsx
// src/web/src/components/events/CreateEventSheet.tsx
import { type FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { events } from "@/api/events";
import Sheet from "@/components/ui/Sheet";
import Button from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateEventSheet({ open, onClose }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [startLocal, setStartLocal] = useState(defaultStartLocal());
  const [durationHours, setDurationHours] = useState(8);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const start = new Date(startLocal);
      const end = new Date(start.getTime() + durationHours * 3600 * 1000);
      return events.create({
        name: name.trim(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startsAtUtc: start.toISOString(),
        endsAtUtc: end.toISOString(),
      });
    },
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      onClose();
      nav(`/events/${ev.id}`);
    },
    onError: (e: Error) => setError(e.message || "Could not create event."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    create.mutate();
  }

  return (
    <Sheet open={open} onClose={onClose} onConfirm={() => handleSubmit(new Event("submit") as unknown as FormEvent)}>
      <h2 className="text-lg font-semibold">New event</h2>
      <p className="mt-1 text-sm text-zinc-500">You can add rooms and a schedule once the event is created.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Name</span>
          <input
            autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Annual Conference 2026"
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus-visible:outline-none focus-visible:border-blue-500"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Starts</span>
            <input
              type="datetime-local" value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-zinc-400 mb-1">Duration (hours)</span>
            <input
              type="number" min={1} max={72} value={durationHours}
              onChange={(e) => setDurationHours(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-zinc-500">Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create event"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function defaultStartLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 2: Update `EventsPage.tsx`**

Replace the entire file:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { events } from "@/api/events";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import Button from "@/components/ui/Button";
import SkeletonRow from "@/components/ui/SkeletonRow";
import CreateEventSheet from "@/components/events/CreateEventSheet";
import { Plus, Calendar } from "lucide-react";

export default function EventsPage() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <div className="flex items-center gap-3">
          <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New event</Button>
          <SignOutButton />
        </div>
      </div>

      {eventsQuery.isLoading && <SkeletonRow count={3} />}
      {eventsQuery.error && <p className="text-sm text-red-400">Couldn't load events.</p>}

      {eventsQuery.data && eventsQuery.data.length > 0 && (
        <ul className="space-y-2">
          {eventsQuery.data.map((ev) => (
            <li key={ev.id} className="rounded border border-zinc-800 bg-zinc-900 transition-colors hover:bg-zinc-800/60">
              <Link to={`/events/${ev.id}`} className="block w-full p-4">
                <div className="font-medium">{ev.name}</div>
                <div className="text-xs text-zinc-400">{new Date(ev.startsAtUtc).toLocaleString()}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {eventsQuery.data && eventsQuery.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center">
          <Calendar className="mx-auto size-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium">Create your first event</h2>
          <p className="mt-1 text-sm text-zinc-500">
            An event groups one or more rooms, each with its own schedule and timer.
          </p>
          <div className="mt-4">
            <Button leadingIcon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New event</Button>
          </div>
        </div>
      )}

      <CreateEventSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function SignOutButton() {
  const nav = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <button
      onClick={async () => { await auth.signOut(); signOut(); nav("/signin"); }}
      className="text-sm text-zinc-400 hover:text-zinc-200">
      Sign out
    </button>
  );
}
```

- [ ] **Step 3: Manual verify**

`npm run dev`. With an empty events list, confirm the illustrated empty state appears with "New event" CTA. Click — sheet opens. Fill in name, click "Create event" — sheet closes and the user lands on the new event's dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/web/src/components/events/CreateEventSheet.tsx src/web/src/pages/EventsPage.tsx
git commit -m "feat(web): + New event sheet on EventsPage, illustrated empty state"
```

---

### Task 1.5: Replace `window.confirm()` with `ConfirmDialog` everywhere

This task replaces 6+ confirm sites. Group them in one commit since they all use the same pattern.

**Files:**
- Modify: `src/web/src/pages/EventDashboardPage.tsx` — lobby rotation, room rotation
- Modify: `src/web/src/pages/ScheduleEditorPage.tsx` — delete item
- Modify: `src/web/src/pages/MembersPage.tsx` — remove member, revoke invitation
- Modify: `src/web/src/pages/MessageTemplatesPage.tsx` — delete template

- [ ] **Step 1: Rewrite `EventDashboardPage.tsx` confirm logic**

Add state for pending actions and render the dialog. Replace the existing `onRotateLobby` and `onRotateRoom`:

```tsx
// Add imports:
import { useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

// Inside component:
const toast = useToast();
const [pendingRotate, setPendingRotate] = useState<
  | { kind: "lobby" }
  | { kind: "room"; id: string; name: string }
  | null
>(null);

// Replace onRotateLobby / onRotateRoom with:
function confirmRotate() {
  if (!pendingRotate) return;
  if (pendingRotate.kind === "lobby") {
    rotateLobby.mutate(undefined, {
      onSuccess: () => toast.show({ message: "Lobby access code reset" }),
      onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
    });
  } else {
    rotateRoom.mutate(pendingRotate.id, {
      onSuccess: () => toast.show({ message: `Access code reset for ${pendingRotate.name}` }),
      onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
    });
  }
  setPendingRotate(null);
}

// Update the lobby Regenerate button:
<button
  type="button"
  onClick={() => setPendingRotate({ kind: "lobby" })}
  disabled={rotateLobby.isPending}
  className="text-xs text-zinc-400 hover:text-zinc-200 underline disabled:opacity-50"
>
  {rotateLobby.isPending ? "Resetting…" : "Reset access code"}
</button>

// Update the room Regenerate button:
<button
  type="button"
  onClick={() => setPendingRotate({ kind: "room", id: r.id, name: r.name })}
  disabled={rotateRoom.isPending}
  className="text-xs text-zinc-400 hover:text-zinc-200 underline disabled:opacity-50"
>
  Reset access code
</button>

// At the end of the JSX, before the closing </div>, add:
<ConfirmDialog
  open={pendingRotate !== null}
  tone="danger"
  title="Reset access code?"
  message={
    pendingRotate?.kind === "lobby"
      ? "The current lobby code will stop working. Anyone viewing the lobby — including signage and audience devices — will be disconnected and need the new code."
      : pendingRotate?.kind === "room"
        ? <>The current access code for <strong>{pendingRotate.name}</strong> will stop working. Any speaker view or door display using this code will be disconnected.</>
        : ""
  }
  confirmLabel="Reset code"
  onConfirm={confirmRotate}
  onCancel={() => setPendingRotate(null)}
/>
```

- [ ] **Step 2: Rewrite `ScheduleEditorPage.tsx` delete confirm**

```tsx
// Add imports:
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Add state:
const [pendingDelete, setPendingDelete] = useState<ScheduleItemDto | null>(null);

// Replace the onDelete prop passed to ScheduleEditor:
<ScheduleEditor
  items={itemsQuery.data!}
  onReorder={(ids) => reorderMutation.mutate(ids)}
  onEdit={(item) => setEditing(item)}
  onDelete={(item) => setPendingDelete(item)}
/>

// At the end of the JSX, add:
<ConfirmDialog
  open={pendingDelete !== null}
  tone="danger"
  title="Delete schedule item?"
  message={pendingDelete ? <>This removes <strong>{pendingDelete.title}</strong> from the schedule.</> : ""}
  confirmLabel="Delete"
  onConfirm={() => {
    if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
    setPendingDelete(null);
  }}
  onCancel={() => setPendingDelete(null)}
/>
```

- [ ] **Step 3: Rewrite `MembersPage.tsx` confirms**

```tsx
// Add imports:
import ConfirmDialog from "@/components/ui/ConfirmDialog";
// (useState is already imported)

// Inside the component, alongside existing state:
const [pendingRemoveMember, setPendingRemoveMember] = useState<{ id: string; email: string } | null>(null);
const [pendingRevoke, setPendingRevoke] = useState<{ id: string; email: string } | null>(null);

// Replace the inline confirm in the invitation revoke button:
<button onClick={() => setPendingRevoke({ id: inv.id, email: inv.email })}
  className="text-zinc-500 hover:text-red-400">
  <Trash2 className="size-4" />
</button>

// Replace the inline confirm in the member remove button:
<button onClick={() => setPendingRemoveMember({ id: m.id, email: m.email })}
  className="text-zinc-500 hover:text-red-400">
  <Trash2 className="size-4" />
</button>

// At the end of the JSX (just before the closing </div>):
<ConfirmDialog
  open={pendingRemoveMember !== null}
  tone="danger"
  title="Remove member?"
  message={pendingRemoveMember ? <><strong>{pendingRemoveMember.email}</strong> will lose access to this event.</> : ""}
  confirmLabel="Remove"
  onConfirm={() => {
    if (pendingRemoveMember) removeMember.mutate(pendingRemoveMember.id);
    setPendingRemoveMember(null);
  }}
  onCancel={() => setPendingRemoveMember(null)}
/>
<ConfirmDialog
  open={pendingRevoke !== null}
  tone="danger"
  title="Revoke invitation?"
  message={pendingRevoke ? <><strong>{pendingRevoke.email}</strong> won't be able to accept this invitation anymore.</> : ""}
  confirmLabel="Revoke"
  onConfirm={() => {
    if (pendingRevoke) revoke.mutate(pendingRevoke.id);
    setPendingRevoke(null);
  }}
  onCancel={() => setPendingRevoke(null)}
/>
```

- [ ] **Step 4: Rewrite `MessageTemplatesPage.tsx` confirm**

```tsx
// Add imports:
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// Inside the component, alongside existing state:
const [pendingDelete, setPendingDelete] = useState<TemplateDto | null>(null);

// Replace the inline confirm in the delete button:
<button onClick={() => setPendingDelete(t)}
  className="text-zinc-500 hover:text-red-400">
  <Trash2 className="size-4" />
</button>

// At the end of the JSX, just before the closing </div>:
<ConfirmDialog
  open={pendingDelete !== null}
  tone="danger"
  title="Delete template?"
  message={pendingDelete ? <>"{pendingDelete.text}" will be removed.</> : ""}
  confirmLabel="Delete"
  onConfirm={() => {
    if (pendingDelete) remove.mutate(pendingDelete.id);
    setPendingDelete(null);
  }}
  onCancel={() => setPendingDelete(null)}
/>
```

- [ ] **Step 5: Verify no `window.confirm` remains**

Run: `grep -rn "window.confirm\|^[^/]*\bconfirm(" src/web/src --include="*.tsx" --include="*.ts"`
Expected: no matches outside the new ConfirmDialog/Sheet code.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/pages/EventDashboardPage.tsx src/web/src/pages/ScheduleEditorPage.tsx src/web/src/pages/MembersPage.tsx src/web/src/pages/MessageTemplatesPage.tsx
git commit -m "feat(web): replace all window.confirm() with ConfirmDialog primitive"
```

---

### Task 1.6: Humane API error mapping for sign-in + helpers

**Files:**
- Create: `src/web/src/lib/apiErrors.ts`
- Create: `src/web/src/test/apiErrors.test.ts`
- Modify: `src/web/src/pages/SignInPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/web/src/test/apiErrors.test.ts
import { describe, it, expect } from "vitest";
import { apiErrorMessage } from "@/lib/apiErrors";
import { ApiError } from "@/api/client";

describe("apiErrorMessage", () => {
  it("returns auth-specific copy for 401 on sign-in", () => {
    const err = new ApiError(401, "Unauthorized");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/email or password/i);
  });
  it("returns lockout copy for 423", () => {
    const err = new ApiError(423, "Locked");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/locked/i);
  });
  it("returns network copy when status is 0", () => {
    const err = new ApiError(0, "Network down");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/can't reach|network/i);
  });
  it("falls back to a generic-but-humane message", () => {
    const err = new ApiError(500, "Internal Server Error");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/something went wrong/i);
  });
  it("uses default context when no context provided", () => {
    const err = new ApiError(404, "Not Found");
    expect(apiErrorMessage(err)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/apiErrors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/lib/apiErrors.ts
import { ApiError } from "@/api/client";

type Context = "sign-in" | "default";

export function apiErrorMessage(err: unknown, ctx: Context = "default"): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Can't reach Stagecue. Check your network connection.";
    if (ctx === "sign-in") {
      if (err.status === 401) return "Email or password is incorrect.";
      if (err.status === 423) return "Your account is locked. Try again in a few minutes or contact your administrator.";
      if (err.status === 429) return "Too many sign-in attempts. Please wait a moment and try again.";
    }
    if (err.status === 404) return "We couldn't find what you were looking for.";
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/apiErrors.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Use in `SignInPage.tsx`**

Replace the `catch` block:

```tsx
// Add import:
import { apiErrorMessage } from "@/lib/apiErrors";

// Inside onSubmit:
async function onSubmit(e: FormEvent) {
  e.preventDefault();
  setError(null);
  try {
    await auth.signIn(email, password);
    setSignedIn(email);
    nav("/");
  } catch (err) {
    setError(apiErrorMessage(err, "sign-in"));
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/web/src/lib/apiErrors.ts src/web/src/test/apiErrors.test.ts src/web/src/pages/SignInPage.tsx
git commit -m "feat(web): humane API error mapping, use it on sign-in"
```

---

### Task 1.7: Empty state polish for Schedule, Templates, and Members

**Files:**
- Modify: `src/web/src/components/control/ScheduleEditor.tsx` (`li:line 36`)
- Modify: `src/web/src/components/control/ScheduleList.tsx` (`li:line 23`)
- Modify: `src/web/src/pages/MessageTemplatesPage.tsx`
- Modify: `src/web/src/pages/MembersPage.tsx`
- Modify: `src/web/src/pages/NotFoundPage.tsx`

- [ ] **Step 1: Update ScheduleEditor empty state**

Replace `<li className="p-4 text-sm text-zinc-500">No items yet.</li>` with:

```tsx
<li className="p-6 text-center text-sm text-zinc-500">
  Plan the order of your sessions. Add the first item with the button above.
</li>
```

- [ ] **Step 2: Update ScheduleList empty state**

Replace `<li className="p-3 text-sm text-zinc-500">No items in this room's schedule.</li>` with:

```tsx
<li className="p-6 text-center text-sm text-zinc-500">
  No sessions scheduled. Visit <strong>Schedule</strong> to add the first one.
</li>
```

- [ ] **Step 3: Update MessageTemplatesPage empty state**

Replace `<li className="p-3 text-sm text-zinc-500">No templates yet.</li>` with:

```tsx
<li className="p-6 text-center text-sm text-zinc-500">
  Templates are reusable messages you can send to speakers in one tap. Try "Wrap up" or "5 min left".
</li>
```

- [ ] **Step 4: Update MembersPage empty pending state**

Replace `<li className="p-3 text-sm text-zinc-500">No pending invitations.</li>` with:

```tsx
<li className="p-6 text-center text-sm text-zinc-500">No invitations waiting.</li>
```

- [ ] **Step 5: Rewrite NotFoundPage**

```tsx
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";

export default function NotFoundPage() {
  return (
    <div className="p-10 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-semibold">We can't find that page</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The link you followed might be out of date.
      </p>
      <div className="mt-6">
        <Link to="/"><Button>Back to events</Button></Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/web/src/components/control/ScheduleEditor.tsx src/web/src/components/control/ScheduleList.tsx src/web/src/pages/MessageTemplatesPage.tsx src/web/src/pages/MembersPage.tsx src/web/src/pages/NotFoundPage.tsx
git commit -m "feat(web): humane empty states for schedule, templates, members, 404"
```

---

## Phase 2 — Live event confidence

### Task 2.1: Hub error normalization

**Files:**
- Create: `src/web/src/lib/hubErrors.ts`
- Create: `src/web/src/test/hubErrors.test.ts`
- Modify: `src/web/src/components/control/TransportControls.tsx`
- Modify: `src/web/src/components/control/TimeAdjustments.tsx`
- Modify: `src/web/src/components/control/MessageInput.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/web/src/test/hubErrors.test.ts
import { describe, it, expect } from "vitest";
import { humaniseHubError } from "@/lib/hubErrors";

describe("humaniseHubError", () => {
  it("recognises VersionMismatch", () => {
    expect(humaniseHubError(new Error("Microsoft.AspNetCore.SignalR.HubException: VersionMismatch"))).toMatch(/another operator|out of date/i);
  });
  it("recognises StaleVersion (alias)", () => {
    expect(humaniseHubError(new Error("HubException: StaleVersion"))).toMatch(/another operator|out of date/i);
  });
  it("recognises InvalidPhase", () => {
    expect(humaniseHubError(new Error("HubException: InvalidPhase"))).toMatch(/not the right time|can't.* now/i);
  });
  it("recognises NoNextItem", () => {
    expect(humaniseHubError(new Error("HubException: NoNextItem"))).toMatch(/nothing to skip|no more/i);
  });
  it("falls back for unknown errors", () => {
    expect(humaniseHubError(new Error("Some weird thing"))).toMatch(/something went wrong/i);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/hubErrors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/lib/hubErrors.ts
export function humaniseHubError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/VersionMismatch|StaleVersion/i.test(msg)) {
    return "Your view was out of date — another operator just changed something. Refreshing now.";
  }
  if (/InvalidPhase/i.test(msg)) {
    return "That's not the right time for that action. The timer state has moved on.";
  }
  if (/NoNextItem/i.test(msg)) {
    return "Nothing to skip — this is the last item in the schedule.";
  }
  if (/NotFound/i.test(msg)) {
    return "We couldn't find that. It may have been removed.";
  }
  if (/Forbidden|Unauthorized/i.test(msg)) {
    return "You don't have permission to do that.";
  }
  return "Something went wrong. The system has been notified.";
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/hubErrors.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Use in the three control components**

In each of `TransportControls.tsx`, `TimeAdjustments.tsx`, `MessageInput.tsx`, find the `handle` helper:

```tsx
const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(String(e)));
```

Replace with:

```tsx
import { humaniseHubError } from "@/lib/hubErrors";
// ...
const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));
```

In `TimeAdjustments.tsx`, also update the inline error fallback:
```tsx
if (sec == null) { onError?.("Use the MM:SS format — like 12:30."); return; }
```

- [ ] **Step 6: Use Toast for hub errors in RoomControlPage**

In `RoomControlPage.tsx`, replace the `useState<string | null>` for `hubError` and the inline `<p>` with a toast call. Add at top:

```tsx
import { useToast } from "@/components/ui/Toast";
// inside the component:
const toast = useToast();
// remove the [hubError, setHubError] state and the <p className="text-sm text-red-400">{hubError}</p> render.
// pass toast-driven onError to each child:
<TransportControls hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
<TimeAdjustments hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
<MessageInput hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
```

- [ ] **Step 7: Commit**

```bash
git add src/web/src/lib/hubErrors.ts src/web/src/test/hubErrors.test.ts src/web/src/components/control/TransportControls.tsx src/web/src/components/control/TimeAdjustments.tsx src/web/src/components/control/MessageInput.tsx src/web/src/pages/RoomControlPage.tsx
git commit -m "feat(web): humanise SignalR hub errors, surface via toast"
```

---

### Task 2.2: App shell with persistent event context

**Files:**
- Create: `src/web/src/components/shell/AppShell.tsx`
- Create: `src/web/src/components/shell/EventContextBar.tsx`
- Modify: `src/web/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Implement `EventContextBar`**

```tsx
// src/web/src/components/shell/EventContextBar.tsx
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { events } from "@/api/events";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const SETUP_SEGMENTS = ["templates", "branding", "members", "audit"];

export default function EventContextBar() {
  const { eventId } = useParams();
  const location = useLocation();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: events.list });
  // We only resolve the current event from /events/:eventId/* routes. For
  // /rooms/:roomId/* the shell shows no event chip — context is preserved by
  // browser Back. A future improvement: cache room→event mapping.
  const current = eventsQuery.data?.find((e) => e.id === eventId);

  const onSetupTab = SETUP_SEGMENTS.some((s) => location.pathname.includes(`/${s}`));
  const onRunTab = !!eventId && !onSetupTab;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">Stagecue</Link>
        {current && (
          <>
            <span className="text-zinc-700">/</span>
            <EventSwitcher current={current} events={eventsQuery.data ?? []} />
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {current && (
          <nav className="flex items-center gap-1 text-sm">
            <TabLink to={`/events/${current.id}`} active={onRunTab}>Run</TabLink>
            <TabLink to={`/events/${current.id}/templates`} active={onSetupTab}>Setup</TabLink>
          </nav>
        )}
        <SignOutButton />
      </div>
    </header>
  );
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`rounded px-3 py-1.5 transition-colors ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`}
    >
      {children}
    </Link>
  );
}

function EventSwitcher({ current, events }: { current: { id: string; name: string }; events: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium hover:bg-zinc-800"
      >
        {current.name}
        <ChevronDown className="size-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[200px] rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
          {events.map((e) => (
            <Link
              key={e.id} to={`/events/${e.id}`} onClick={() => setOpen(false)}
              className={`block px-3 py-1.5 text-sm hover:bg-zinc-800 ${e.id === current.id ? "text-zinc-100" : "text-zinc-400"}`}
            >
              {e.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SignOutButton() {
  const nav = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <button
      onClick={async () => { await auth.signOut(); signOut(); nav("/signin"); }}
      className="text-sm text-zinc-400 hover:text-zinc-200">
      Sign out
    </button>
  );
}

```

- [ ] **Step 2: Implement `AppShell`**

```tsx
// src/web/src/components/shell/AppShell.tsx
import type { ReactNode } from "react";
import EventContextBar from "./EventContextBar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <EventContextBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Wrap protected routes**

Modify `src/web/src/components/ProtectedRoute.tsx` to wrap successful children in `<AppShell>`:

```tsx
import AppShell from "@/components/shell/AppShell";
// ...
if (checking) return <div className="p-8">Loading…</div>;
if (needsSetup) return <Navigate to="/setup" replace />;
if (redirectToSignIn) return <Navigate to="/signin" replace />;
return <AppShell>{children}</AppShell>;
```

- [ ] **Step 4: Remove now-redundant sign-out + back-links**

- `EventsPage.tsx`: remove the inline `SignOutButton` from the header (the shell provides it). Keep the page-level `New event` button.
- `EventDashboardPage.tsx`: remove the `← All events` link and the inline `<nav>` (Templates · Branding · Members · Audit) — the shell handles those tabs.

- [ ] **Step 5: Manual verify**

`npm run dev`. Navigate through: Events → Event → Schedule → Speaker view (in new tab). Confirm: top bar persists, current event name visible, switcher works, Sign out works.

- [ ] **Step 6: Commit**

```bash
git add src/web/src/components/shell/AppShell.tsx src/web/src/components/shell/EventContextBar.tsx src/web/src/components/ProtectedRoute.tsx src/web/src/pages/EventsPage.tsx src/web/src/pages/EventDashboardPage.tsx
git commit -m "feat(web): persistent AppShell with event switcher and Run/Setup tabs"
```

---

### Task 2.3: Transport controls v2 — dominant Start, overflow for Reset/Skip

**Files:**
- Create: `src/web/src/components/control/TransportControlsV2.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`
- Delete: `src/web/src/components/control/TransportControls.tsx` (after switchover)

- [ ] **Step 1: Implement `TransportControlsV2`**

```tsx
// src/web/src/components/control/TransportControlsV2.tsx
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { Play, Pause, Square, RotateCcw, SkipForward, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { humaniseHubError } from "@/lib/hubErrors";
import Button from "@/components/ui/Button";

interface Props {
  hub: TimerHub | null;
  snapshot: Snapshot;
  onError?: (e: string) => void;
}

export default function TransportControlsV2({ hub, snapshot, onError }: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  if (!hub) return null;
  const v = snapshot.version;
  const phase = snapshot.phase;
  const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));

  const canSkip = (phase === "Running" || phase === "Paused") && snapshot.currentItem !== null;
  const canReset = phase !== "Idle" || snapshot.currentItem !== null || snapshot.currentRunId !== null;

  // Determine the single dominant action for this state.
  let dominant: { label: string; onClick: () => void } | null = null;
  if (phase === "Idle" && snapshot.currentItem) {
    dominant = {
      label: `Start: ${snapshot.currentItem.title}`,
      onClick: () => handle(hub.startItem(snapshot.roomId, snapshot.currentItem!.id, v)),
    };
  } else if (phase === "Idle" && !snapshot.currentItem) {
    dominant = {
      label: "Start next item",
      onClick: () => handle(hub.startAuto(snapshot.roomId, v)),
    };
  } else if (phase === "Running") {
    dominant = {
      label: "Pause",
      onClick: () => handle(hub.pause(snapshot.roomId, v)),
    };
  } else if (phase === "Paused") {
    dominant = {
      label: "Resume",
      onClick: () => handle(hub.resume(snapshot.roomId, v)),
    };
  }

  const showStop = phase === "Running" || phase === "Paused";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {dominant && (
        <Button size="lg" onClick={dominant.onClick} leadingIcon={phase === "Running" ? <Pause className="size-5" /> : <Play className="size-5" />}>
          {dominant.label}
        </Button>
      )}
      {showStop && (
        <Button size="md" variant="secondary" onClick={() => handle(hub.stopRoom(snapshot.roomId, v))} leadingIcon={<Square className="size-4" />}>
          Stop
        </Button>
      )}

      <div className="relative">
        <Button
          size="md" variant="ghost" onClick={() => setOverflowOpen((s) => !s)}
          leadingIcon={<MoreHorizontal className="size-4" />}
        >
          More
        </Button>
        {overflowOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-lg">
            <OverflowItem disabled={!canSkip} onClick={() => { handle(hub.skipNext(snapshot.roomId, v)); setOverflowOpen(false); }} icon={<SkipForward className="size-4" />}>Skip to next</OverflowItem>
            <OverflowItem disabled={!canReset} onClick={() => { handle(hub.reset(snapshot.roomId, v)); setOverflowOpen(false); }} icon={<RotateCcw className="size-4" />}>Reset room</OverflowItem>
          </div>
        )}
      </div>
    </div>
  );
}

function OverflowItem({ icon, children, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}{children}
    </button>
  );
}
```

- [ ] **Step 2: Swap into `RoomControlPage.tsx`**

```tsx
// Replace import
import TransportControlsV2 from "@/components/control/TransportControlsV2";

// Replace <TransportControls .../> with:
<TransportControlsV2 hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
```

- [ ] **Step 3: Delete the old component**

Run: `rm src/web/src/components/control/TransportControls.tsx`

Verify no other file imports it:
Run: `grep -rn "TransportControls\"\|from.*TransportControls'" src/web/src --include="*.tsx" --include="*.ts" | grep -v V2`
Expected: no matches.

- [ ] **Step 4: Manual verify**

Open `/rooms/:roomId`. Confirm: one dominant action visible (Start / Pause / Resume), Stop appears when relevant, "More" reveals Skip + Reset, the inline message about "Start next item" is now in the button label itself.

- [ ] **Step 5: Commit**

```bash
git add src/web/src/components/control/TransportControlsV2.tsx src/web/src/pages/RoomControlPage.tsx
git rm src/web/src/components/control/TransportControls.tsx
git commit -m "feat(web): TransportControlsV2 with dominant action + overflow for Reset/Skip"
```

---

### Task 2.4: Cue strip on room control

**Files:**
- Create: `src/web/src/components/control/CueStrip.tsx`
- Create: `src/web/src/lib/timeHints.ts`
- Create: `src/web/src/test/timeHints.test.ts`
- Modify: `src/web/src/pages/RoomControlPage.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// src/web/src/test/timeHints.test.ts
import { describe, it, expect } from "vitest";
import { relativeStartHint } from "@/lib/timeHints";

const NOW = new Date("2026-05-11T14:00:00Z").getTime();

describe("relativeStartHint", () => {
  it("returns 'starts in N min' for near future", () => {
    expect(relativeStartHint(new Date("2026-05-11T14:12:00Z").toISOString(), NOW)).toBe("in 12 min");
  });
  it("returns 'starts in N sec' under a minute", () => {
    expect(relativeStartHint(new Date("2026-05-11T14:00:30Z").toISOString(), NOW)).toBe("in 30 sec");
  });
  it("returns 'N min over' for past starts", () => {
    expect(relativeStartHint(new Date("2026-05-11T13:55:00Z").toISOString(), NOW)).toBe("5 min ago");
  });
  it("returns absolute time for distant future", () => {
    const tomorrow = new Date("2026-05-12T09:00:00Z").toISOString();
    expect(relativeStartHint(tomorrow, NOW)).toMatch(/tomorrow/i);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/timeHints.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/lib/timeHints.ts
export function relativeStartHint(iso: string, now: number = Date.now()): string {
  const target = new Date(iso).getTime();
  const diff = target - now;
  const absSec = Math.abs(Math.round(diff / 1000));
  const sign = diff >= 0 ? "in" : "ago";

  if (absSec < 60) return diff >= 0 ? `in ${absSec} sec` : `${absSec} sec ago`;
  const min = Math.round(absSec / 60);
  if (min < 60) return diff >= 0 ? `in ${min} min` : `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 12) return diff >= 0 ? `in ${hr} h` : `${hr} h ago`;

  const d = new Date(target);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(now + 24 * 3600 * 1000);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `today at ${time}`;
  if (isTomorrow) return `tomorrow at ${time}`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/timeHints.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Implement `CueStrip`**

```tsx
// src/web/src/components/control/CueStrip.tsx
import type { Snapshot } from "@/api/types";
import { relativeStartHint } from "@/lib/timeHints";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

interface Props { snapshot: Snapshot }

export default function CueStrip({ snapshot }: Props) {
  // Re-render every 10s so the relative hint stays accurate without re-mounting on the 100ms tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // Decide what to surface.
  let leading: string;
  let title: string;
  let subtitle: string | null;
  if (snapshot.phase === "Running" && snapshot.currentItem) {
    leading = "Now"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.phase === "Paused" && snapshot.currentItem) {
    leading = "Paused"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.phase === "PreRoll" && snapshot.currentItem) {
    leading = "Starting"; title = snapshot.currentItem.title; subtitle = snapshot.currentItem.speakerName ?? null;
  } else if (snapshot.nextItem) {
    leading = "Next";
    title = snapshot.nextItem.title;
    subtitle = relativeStartHint(snapshot.nextItem.scheduledStartUtc);
  } else {
    leading = "No upcoming items"; title = "Nothing scheduled"; subtitle = null;
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <Play className="size-5 text-zinc-500" />
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-widest text-zinc-500">{leading}</div>
        <div className="truncate text-base font-medium">{title}</div>
        {subtitle && <div className="text-sm text-zinc-400">{subtitle}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire into `RoomControlPage.tsx`**

Add import and place `<CueStrip />` at the top of the page, above the countdown card:

```tsx
import CueStrip from "@/components/control/CueStrip";
// ...
<h1 className="text-xl font-semibold">Room control</h1>
<CueStrip snapshot={snapshot} />
<div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex justify-center">
  <Countdown snapshot={snapshot} skewMs={skewMs} />
</div>
```

- [ ] **Step 7: Commit**

```bash
git add src/web/src/lib/timeHints.ts src/web/src/test/timeHints.test.ts src/web/src/components/control/CueStrip.tsx src/web/src/pages/RoomControlPage.tsx
git commit -m "feat(web): CueStrip on room control with relative start hints"
```

---

### Task 2.5: Keyboard shortcuts on room control

**Files:**
- Create: `src/web/src/hooks/useShortcuts.ts`
- Create: `src/web/src/test/useShortcuts.test.tsx`
- Create: `src/web/src/components/control/ShortcutsOverlay.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/web/src/test/useShortcuts.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import useShortcuts from "@/hooks/useShortcuts";

function Harness({ map }: { map: Record<string, () => void> }) {
  useShortcuts(map);
  return <div />;
}

describe("useShortcuts", () => {
  it("invokes the handler when the matching key is pressed", () => {
    const handler = vi.fn();
    render(<Harness map={{ Space: handler }} />);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("ignores key presses when focus is inside an input", () => {
    const handler = vi.fn();
    render(
      <>
        <input data-testid="i" />
        <Harness map={{ Space: handler }} />
      </>,
    );
    const input = document.querySelector('[data-testid="i"]') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: " ", code: "Space" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("supports letter keys", () => {
    const handler = vi.fn();
    render(<Harness map={{ s: handler }} />);
    fireEvent.keyDown(window, { key: "s" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd src/web && npx vitest run src/test/useShortcuts.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/web/src/hooks/useShortcuts.ts
import { useEffect } from "react";

/** Map from key (or code for Space) to handler. Letter keys are case-insensitive. */
export default function useShortcuts(map: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // Match by code first (Space) then by case-insensitive key.
      const codeMatch = map[e.code];
      if (codeMatch) { e.preventDefault(); codeMatch(); return; }
      const keyMatch = map[e.key] ?? map[e.key.toLowerCase()];
      if (keyMatch) { e.preventDefault(); keyMatch(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd src/web && npx vitest run src/test/useShortcuts.test.tsx`
Expected: 3 passed.

- [ ] **Step 5: Implement `ShortcutsOverlay`**

```tsx
// src/web/src/components/control/ShortcutsOverlay.tsx
import Sheet from "@/components/ui/Sheet";

interface Props { open: boolean; onClose: () => void }

const shortcuts: Array<[string, string]> = [
  ["Space", "Pause / Resume"],
  ["S", "Skip to next item"],
  ["R", "Reset room"],
  ["M", "Focus message input"],
  ["1 – 4", "Send the corresponding preset message"],
  ["?", "Show this shortcuts list"],
  ["Esc", "Close any open dialog"],
];

export default function ShortcutsOverlay({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} maxWidth="24rem">
      <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {shortcuts.map(([keys, desc]) => (
          <li key={keys} className="flex items-baseline justify-between gap-4">
            <kbd className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-xs">{keys}</kbd>
            <span className="text-zinc-300">{desc}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
```

- [ ] **Step 6: Wire shortcuts into `RoomControlPage.tsx`**

Add (inside the component, after `snapshot`/`hub` are available):

```tsx
import useShortcuts from "@/hooks/useShortcuts";
import ShortcutsOverlay from "@/components/control/ShortcutsOverlay";
import { useRef } from "react";
import { humaniseHubError } from "@/lib/hubErrors";

// inside RoomControlPage:
const [shortcutsOpen, setShortcutsOpen] = useState(false);
const messageInputRef = useRef<HTMLInputElement>(null);

const safe = (p: Promise<unknown>) => p.catch((e) => toast.show({ message: humaniseHubError(e), tone: "error" }));

useShortcuts({
  Space: () => {
    if (!snapshot || !hub) return;
    if (snapshot.phase === "Running") safe(hub.pause(snapshot.roomId, snapshot.version));
    else if (snapshot.phase === "Paused") safe(hub.resume(snapshot.roomId, snapshot.version));
    else if (snapshot.phase === "Idle") safe(snapshot.currentItem ? hub.startItem(snapshot.roomId, snapshot.currentItem.id, snapshot.version) : hub.startAuto(snapshot.roomId, snapshot.version));
  },
  s: () => snapshot && hub && safe(hub.skipNext(snapshot.roomId, snapshot.version)),
  r: () => snapshot && hub && safe(hub.reset(snapshot.roomId, snapshot.version)),
  m: () => messageInputRef.current?.focus(),
  "?": () => setShortcutsOpen(true),
});

// at end of JSX:
<ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
```

- [ ] **Step 7: Forward ref into `MessageInput`**

Modify `src/web/src/components/control/MessageInput.tsx` to accept and forward a `ref` to the text input:

```tsx
import { forwardRef, useState } from "react";
import type { Snapshot } from "@/api/types";
import type { TimerHub } from "@/hub/timerHub";
import { humaniseHubError } from "@/lib/hubErrors";

const presets = ["Wrap up", "5 min over", "Q&A time", "Mic check"];

const MessageInput = forwardRef<HTMLInputElement, { hub: TimerHub | null; snapshot: Snapshot; onError?: (e: string) => void }>(
  function MessageInput({ hub, snapshot, onError }, ref) {
    const [draft, setDraft] = useState("");
    if (!hub) return null;
    const handle = (p: Promise<unknown>) => p.catch((e) => onError?.(humaniseHubError(e)));
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            ref={ref}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={snapshot.currentMessage ? `Currently: ${snapshot.currentMessage}` : "Type a message"}
            className="flex-1 px-3 py-2 rounded bg-zinc-900 border border-zinc-800" />
          <button
            onClick={() => { handle(hub.setMessage(snapshot.roomId, draft.trim() || null)); setDraft(""); }}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm">Send</button>
          <button
            onClick={() => handle(hub.clearMessage(snapshot.roomId))}
            className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm">Clear</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => handle(hub.setMessage(snapshot.roomId, p))}
              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs">{p}</button>
          ))}
        </div>
      </div>
    );
  },
);

export default MessageInput;
```

Update the usage in `RoomControlPage.tsx` to pass the ref:

```tsx
<MessageInput ref={messageInputRef} hub={hub} snapshot={snapshot} onError={(m) => toast.show({ message: m, tone: "error" })} />
```

Note: also extend `useShortcuts` map so `1`–`4` send the matching preset:

```tsx
const sendPreset = (i: number) => {
  if (!snapshot || !hub) return;
  const presets = ["Wrap up", "5 min over", "Q&A time", "Mic check"];
  safe(hub.setMessage(snapshot.roomId, presets[i - 1]));
};

useShortcuts({
  // ... existing
  "1": () => sendPreset(1),
  "2": () => sendPreset(2),
  "3": () => sendPreset(3),
  "4": () => sendPreset(4),
});
```

- [ ] **Step 8: Manual verify**

`/rooms/:roomId`. Press `?` — overlay shows. Press `Esc` — closes. Press `Space` — pauses/resumes. Press `m` — message input focused. Press `1` — "Wrap up" sent.

- [ ] **Step 9: Commit**

```bash
git add src/web/src/hooks/useShortcuts.ts src/web/src/test/useShortcuts.test.tsx src/web/src/components/control/ShortcutsOverlay.tsx src/web/src/components/control/MessageInput.tsx src/web/src/pages/RoomControlPage.tsx
git commit -m "feat(web): keyboard shortcuts (Space/S/R/M/1-4/?) on room control"
```

---

### Task 2.6: Undo toast for destructive schedule operations

**Files:**
- Modify: `src/web/src/pages/ScheduleEditorPage.tsx`

Approach: when an item is deleted, we keep the original payload in a closure and show a toast with "Undo" that re-creates the item (the new item will have a new id, but the user gets their content back).

- [ ] **Step 1: Wire undo toast into delete**

In `ScheduleEditorPage.tsx`, replace the existing `deleteMutation` and the confirm flow:

```tsx
import { useToast } from "@/components/ui/Toast";

const toast = useToast();

const deleteMutation = useMutation({
  mutationFn: (id: string) => scheduleItems.remove(roomId!, id),
  onSuccess: (_data, _id, ctx) => {
    qc.invalidateQueries({ queryKey: ["schedule", roomId] });
    // ctx is the deleted item we passed in from onMutate.
    const deleted = ctx as unknown as ScheduleItemDto | undefined;
    if (!deleted) return;
    toast.show({
      message: `Deleted "${deleted.title}"`,
      timeoutMs: 8000,
      action: {
        label: "Undo",
        onClick: async () => {
          await createMutation.mutateAsync({
            title: deleted.title,
            speakerName: deleted.speakerName,
            scheduledStartUtc: deleted.scheduledStartUtc,
            durationSec: deleted.durationSec,
            preRollSec: deleted.preRollSec,
            autoStart: deleted.autoStart,
            thresholdsJson: deleted.thresholdsJson,
          });
          toast.show({ message: `Restored "${deleted.title}"` });
        },
      },
    });
  },
  onMutate: (id: string) => {
    return itemsQuery.data?.find((i) => i.id === id);
  },
});

// ConfirmDialog onConfirm:
onConfirm={() => {
  if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
  setPendingDelete(null);
}}
```

(Note: TanStack Query passes `onMutate`'s return value as the 3rd arg of `onSuccess`. We type-assert because the query is shaped with default unknown context.)

- [ ] **Step 2: Manual verify**

Delete a schedule item — toast appears with "Undo". Click within 8s — item is restored.

- [ ] **Step 3: Commit**

```bash
git add src/web/src/pages/ScheduleEditorPage.tsx
git commit -m "feat(web): undo toast for deleted schedule items"
```

---

### Task 2.7: Connecting state polish on public surfaces

**Files:**
- Modify: `src/web/src/pages/SpeakerView.tsx`
- Modify: `src/web/src/pages/DoorView.tsx`
- Modify: `src/web/src/pages/LobbyView.tsx`
- Create: `src/web/src/components/audience/ConnectingScreen.tsx`

- [ ] **Step 1: Implement `ConnectingScreen`**

```tsx
// src/web/src/components/audience/ConnectingScreen.tsx
interface Props {
  /** What we're connecting to. */
  target: string;
  /** Optional error message — if present we show it and a helpful instruction. */
  error?: string | null;
}

export default function ConnectingScreen({ target, error }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="text-3xl font-semibold tracking-tight">Stagecue</div>
      {!error ? (
        <>
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="size-2 animate-pulse rounded-full bg-zinc-500" />
            <span>Connecting to {target}…</span>
          </div>
        </>
      ) : (
        <div className="max-w-md text-center">
          <div className="text-red-400">We can't connect right now.</div>
          <div className="mt-2 text-sm text-zinc-500">
            Check the code printed on your QR card, or ask the event organiser for a fresh one.
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Use in `SpeakerView`**

Replace the three `<CenterMessage>` early returns:

```tsx
import ConnectingScreen from "@/components/audience/ConnectingScreen";

// remove the CenterMessage helper at the bottom

if (resolveError) return <ConnectingScreen target="this room" error={resolveError} />;
if (!roomId) return <ConnectingScreen target="this room" />;
if (error) return <ConnectingScreen target="this room" error={error.message} />;
if (!ready || !snapshot) return <ConnectingScreen target="this room" />;
```

- [ ] **Step 3: Use in `DoorView` and `LobbyView`**

Same pattern. Use `target={info.data?.roomName ?? "this room"}` for DoorView and `target={info.data?.eventName ?? "this event"}` for LobbyView.

- [ ] **Step 4: Commit**

```bash
git add src/web/src/components/audience/ConnectingScreen.tsx src/web/src/pages/SpeakerView.tsx src/web/src/pages/DoorView.tsx src/web/src/pages/LobbyView.tsx
git commit -m "feat(web): branded Connecting screen on speaker/door/lobby surfaces"
```

---

### Task 2.8: Speaker view header readability

**Files:**
- Modify: `src/web/src/components/timer/SessionHeader.tsx`
- Modify: `src/web/src/components/timer/SessionFooter.tsx`

- [ ] **Step 1: Larger, higher-contrast header**

```tsx
// SessionHeader.tsx
import type { SnapshotItem } from "@/api/types";

export default function SessionHeader({ item }: { item: SnapshotItem | null }) {
  if (!item) return <div className="h-12" />;
  return (
    <div className="absolute top-6 left-8 right-8 flex flex-wrap items-baseline justify-between gap-2 text-zinc-300">
      <span className="text-2xl font-medium">{item.title}</span>
      {item.speakerName && <span className="text-lg text-zinc-400">{item.speakerName}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Larger footer**

```tsx
// SessionFooter.tsx
import type { SnapshotNextItem } from "@/api/types";

export default function SessionFooter({ next }: { next: SnapshotNextItem | null }) {
  if (!next) return null;
  return (
    <div className="absolute bottom-6 left-8 right-8 text-base text-zinc-400">
      Next · {next.title} · {new Date(next.scheduledStartUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src/components/timer/SessionHeader.tsx src/web/src/components/timer/SessionFooter.tsx
git commit -m "feat(web): readable SessionHeader/Footer for confidence monitors"
```

---

## Phase 3 — Feels alive

### Task 3.1: Phase transition + final-10s animations on the countdown

**Files:**
- Modify: `src/web/src/components/timer/Countdown.tsx`
- Modify: `src/web/src/styles/globals.css`

- [ ] **Step 1: Add transition styles**

Append to `src/web/src/styles/globals.css`:

```css
/* Smooth color transitions for the countdown across phase/threshold changes. */
.countdown-color { transition: color 250ms ease-out; }

/* Pulse used in the final 10 seconds. */
@keyframes countdown-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.015); }
  100% { transform: scale(1); }
}
.countdown-pulse { animation: countdown-pulse 1s ease-in-out infinite; }

/* Focus ring base used across new primitives. */
*:focus-visible { outline: none; }
```

- [ ] **Step 2: Update `Countdown.tsx`**

```tsx
import { useEffect, useState } from "react";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";
import type { Snapshot } from "@/api/types";

interface Props {
  snapshot: Snapshot;
  skewMs: number;
}

export default function Countdown({ snapshot, skewMs }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const remainingMs = computeRemaining(snapshot, skewMs);
  const isPreRoll = snapshot.phase === "PreRoll";
  const tokens = snapshot.currentItem?.thresholds ?? [];
  const color = isPreRoll ? "var(--accent)" : colorTokenForRemaining(tokens, remainingMs);
  const label = isPreRoll ? "Starts in" : remainingMs <= 0 ? "Overrun" : "Remaining";

  // Pulse during the final 10 seconds of a Running session.
  const pulse = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 10_000;

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3 transition-opacity duration-200">{label}</div>
      <div
        className={`countdown-color font-bold leading-none tabular-nums ${pulse ? "countdown-pulse" : ""}`}
        style={{ color, fontSize: "min(28vw, 360px)", letterSpacing: "-0.04em" }}
      >
        {formatRemaining(remainingMs)}
      </div>
    </div>
  );
}

function computeRemaining(s: Snapshot, skewMs: number): number {
  const serverNow = Date.now() + skewMs;
  if (s.phase === "PreRoll" && s.preRollEndsAtUtc) {
    return new Date(s.preRollEndsAtUtc).getTime() - serverNow;
  }
  if (s.phase === "Running" && s.startedAtUtc && s.currentItem) {
    const elapsedMs = serverNow - new Date(s.startedAtUtc).getTime() - s.pausedAccumSec * 1000;
    const totalMs = (s.currentItem.durationSec + s.adjustmentSec) * 1000;
    return totalMs - elapsedMs;
  }
  if (s.phase === "Paused" && s.pauseRemainingMs != null) {
    return s.pauseRemainingMs;
  }
  return 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src/styles/globals.css src/web/src/components/timer/Countdown.tsx
git commit -m "feat(web): countdown color crossfade + final-10s pulse"
```

---

### Task 3.2: Message overlay slide+fade animation + amber default

**Files:**
- Modify: `src/web/src/components/timer/MessageOverlay.tsx`

Note: the amber default for `message-bg` is already set by Task 1.3 in `theme/defaults.ts`. Also update `globals.css:14` (the CSS variable default).

- [ ] **Step 1: Update CSS variable default**

Find in `src/web/src/styles/globals.css` line 14:
```css
  --message-bg: #c0392b;
```
Replace with:
```css
  --message-bg: #c9b380;
  --message-text: #0a0a0a;
```
(Replace the existing `--message-text: #ffffff;` line in the same `:root` block.)

- [ ] **Step 2: Animated `MessageOverlay`**

```tsx
// src/web/src/components/timer/MessageOverlay.tsx
import { useEffect, useState } from "react";

interface Props { message: string | null }

export default function MessageOverlay({ message }: Props) {
  // We keep the last-displayed message so the exit transition can run before the DOM is unmounted.
  const [visible, setVisible] = useState(false);
  const [displayed, setDisplayed] = useState<string | null>(null);

  useEffect(() => {
    if (message) {
      setDisplayed(message);
      // Defer to next frame so the entrance transition runs.
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      // After exit transition, clear the rendered text.
      const id = setTimeout(() => setDisplayed(null), 250);
      return () => clearTimeout(id);
    }
  }, [message]);

  if (!displayed) return null;

  return (
    <div
      role="status"
      className={`absolute left-1/2 -translate-x-1/2 px-6 py-3 rounded-md font-semibold text-2xl shadow-lg transition duration-250 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
      style={{ bottom: "18%", background: "var(--message-bg)", color: "var(--message-text)" }}
    >
      {displayed}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/web/src/styles/globals.css src/web/src/components/timer/MessageOverlay.tsx
git commit -m "feat(web): message overlay slide+fade animation, amber default tone"
```

---

### Task 3.3: Replace "Loading…" with skeletons

**Files:**
- Modify: `src/web/src/pages/EventsPage.tsx` (already done in 1.4)
- Modify: `src/web/src/pages/EventDashboardPage.tsx`
- Modify: `src/web/src/pages/RoomControlPage.tsx`
- Modify: `src/web/src/pages/ScheduleEditorPage.tsx`
- Modify: `src/web/src/pages/BrandingPage.tsx`
- Modify: `src/web/src/pages/MembersPage.tsx`
- Modify: `src/web/src/pages/MessageTemplatesPage.tsx`
- Modify: `src/web/src/pages/AuditPage.tsx`
- Modify: `src/web/src/pages/InvitationAcceptPage.tsx`
- Modify: `src/web/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Replace each `Loading…` div**

In every listed page, replace the existing loading branch (typically `if (...isLoading) return <div className="p-8">Loading…</div>;`) with a page-appropriate skeleton:

**`EventDashboardPage.tsx`:**
```tsx
import SkeletonRow from "@/components/ui/SkeletonRow";
import Skeleton from "@/components/ui/Skeleton";
// ...
if (evQuery.isLoading || roomsQuery.isLoading) {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-6 w-48" />
      <SkeletonRow count={2} />
    </div>
  );
}
```

**`RoomControlPage.tsx`:**
```tsx
import Skeleton from "@/components/ui/Skeleton";
// ...
if (!ready || !snapshot) {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-6 w-40" />
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-6 flex justify-center">
        <Skeleton className="h-48 w-2/3" />
      </div>
      <Skeleton className="h-10 w-64" />
    </div>
  );
}
```

**`ScheduleEditorPage.tsx`, `BrandingPage.tsx`, `MembersPage.tsx`, `MessageTemplatesPage.tsx`, `AuditPage.tsx`, `InvitationAcceptPage.tsx`:** use `<SkeletonRow count={3} />` inside the page's normal padding wrapper.

**`ProtectedRoute.tsx`:** replace `if (checking) return <div className="p-8">Loading…</div>;` with:
```tsx
if (checking) return <div className="p-8"><Skeleton className="h-4 w-24" /></div>;
```

- [ ] **Step 2: Sanity check**

Run: `grep -rn "Loading…" src/web/src --include="*.tsx"`
Expected: no matches (the audit log copy `"Loading…"` should all be gone).

- [ ] **Step 3: Commit**

```bash
git add src/web/src/pages/ src/web/src/components/ProtectedRoute.tsx
git commit -m "feat(web): skeleton placeholders replace 'Loading…' text everywhere"
```

---

### Task 3.4: Room card phase animation in lobby

**Files:**
- Modify: `src/web/src/components/audience/RoomCard.tsx`

- [ ] **Step 1: Add color transition + subtle phase indicator**

```tsx
import type { Snapshot } from "@/api/types";
import { formatRemaining } from "@/lib/time";
import { colorTokenForRemaining } from "@/lib/thresholds";

interface Props { roomName: string; snapshot: Snapshot | undefined; skewMs: number }

export default function RoomCard({ roomName, snapshot, skewMs }: Props) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2 transition-colors">
        <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
        <div className="text-zinc-500 italic">Waiting for first state…</div>
      </div>
    );
  }
  const remainingMs = computeRemaining(snapshot, skewMs);
  const color = snapshot.phase === "PreRoll"
    ? "var(--accent)"
    : snapshot.phase === "Running" || snapshot.phase === "Paused"
      ? colorTokenForRemaining(snapshot.currentItem?.thresholds ?? [], remainingMs)
      : "var(--text-muted)";

  const ringClass = snapshot.phase === "Running"
    ? "ring-1 ring-green-500/30"
    : snapshot.phase === "Paused"
      ? "ring-1 ring-yellow-500/20"
      : "";

  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-2 transition-all duration-200 ${ringClass}`}>
      <div className="text-sm uppercase tracking-widest text-zinc-500">{roomName}</div>
      <div className="text-lg font-medium truncate" title={snapshot.currentItem?.title ?? ""}>
        {snapshot.currentItem?.title ?? "Idle"}
      </div>
      {snapshot.currentItem?.speakerName && <div className="text-sm text-zinc-500 truncate">{snapshot.currentItem.speakerName}</div>}
      <div className="text-3xl font-bold tabular-nums transition-colors duration-200" style={{ color }}>
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

- [ ] **Step 2: Commit**

```bash
git add src/web/src/components/audience/RoomCard.tsx
git commit -m "feat(web): lobby room card phase-color transitions and ring indicator"
```

---

### Task 3.5: Focus rings + accessibility minimums

**Files:**
- Modify: `src/web/src/styles/globals.css`
- Modify: `src/web/src/pages/SignInPage.tsx`

- [ ] **Step 1: Global focus ring**

Append to `src/web/src/styles/globals.css`:

```css
/* Visible focus ring across the app — overrides any removed outlines. */
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid #5e9eff;
  outline-offset: 2px;
}
```

- [ ] **Step 2: Restore focus on sign-in inputs**

Remove `focus:outline-none focus:border-blue-500` from the sign-in inputs (keep the border-blue on focus-visible, drop the outline-removal):

```tsx
className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800"
```

- [ ] **Step 3: aria-live on countdown for the final minute**

In `src/web/src/components/timer/Countdown.tsx`, add `aria-live="polite"` only when in the final minute and Running:

```tsx
const announce = snapshot.phase === "Running" && remainingMs > 0 && remainingMs <= 60_000;
// ...
<div
  className={`countdown-color font-bold leading-none tabular-nums ${pulse ? "countdown-pulse" : ""}`}
  style={{ color, fontSize: "min(28vw, 360px)", letterSpacing: "-0.04em" }}
  aria-live={announce ? "polite" : undefined}
  aria-atomic={announce ? "true" : undefined}
>
  {formatRemaining(remainingMs)}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/web/src/styles/globals.css src/web/src/pages/SignInPage.tsx src/web/src/components/timer/Countdown.tsx
git commit -m "feat(web): visible focus rings, aria-live on countdown final minute"
```

---

### Task 3.6: Final pass — clean up, lint, build, smoke test

**Files:**
- N/A (verification)

- [ ] **Step 1: Lint**

Run: `cd src/web && npm run lint`
Fix any new errors introduced by the overhaul (most likely: unused imports from the removed components).

- [ ] **Step 2: Type-check + build**

Run: `cd src/web && npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: All tests**

Run: `cd src/web && npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Backend tests (smoke)**

The plan touches only frontend, but verify the backend still passes since shared types may have moved:

Run: `dotnet test`
Expected: all tests pass.

- [ ] **Step 5: End-to-end smoke**

```bash
docker compose down -v
docker compose up --build -d
# Wait for SQL to come up, then either run the wizard or seed:
docker compose run --rm app dotnet EventStageTimer.Api.dll --seed
open http://localhost:8080
```

Verify the golden path:
1. Sign in (or run /setup) — auto-redirect to events list.
2. Empty events list shows new illustrated empty state with "+ New event".
3. Create an event — sheet opens, submission lands you on the event dashboard.
4. Top app shell shows event name + Run/Setup tabs.
5. Open a room control. Cue strip visible. Transport buttons show the right dominant action.
6. Press `?` — shortcuts overlay appears. Press `Esc` — closes.
7. Press `Space` — pause/resume works.
8. Press `1` — "Wrap up" message appears on the speaker view (open in another tab).
9. Delete a schedule item — Undo toast appears, click Undo, item reappears.
10. Reset access code — sheet opens with explanatory copy. Cancel — toast appears.
11. Open the Branding page — visual theme editor visible, no JSON textarea.
12. Sign out from the shell — redirected to /signin.

- [ ] **Step 6: Commit any cleanup**

```bash
git add -A
git commit -m "chore(web): post-overhaul lint and cleanup"
```

---

## Out-of-scope items reminder

If during execution you find yourself wanting to:
- **Add hub-side presence tracking** for the access-code rotation sheet's live counter — STOP. This needs a separate design (SignalR backplane considerations). Note as a follow-up.
- **Replace `<input type="datetime-local">`** with a custom date picker — STOP. Out of scope. The native control stays.
- **Rebuild the audit page** — STOP. Out of scope.
- **Add a Cmd-K command palette** — STOP. Out of scope; separate plan.
- **Refactor the spec into onboarding tour state** — STOP. Out of scope.

If you find a real bug along the way (not a UX wart — an actual broken thing), fix it in a separate commit so the diff stays scoped.

---

## Self-review checklist

Run through this before declaring the plan finished:

1. Every task changes a small, well-scoped set of files (each task is one commit).
2. Every UI primitive in Phase 0 has at least one test.
3. Every logic helper (slug, roleLabel, apiErrors, hubErrors, timeHints) is TDD'd.
4. No task contains placeholder language like "TBD," "add appropriate," or "similar to Task N."
5. The connected-clients counter for access-code rotation is **explicitly out of scope** and documented.
6. The "Create event" API path was confirmed to exist (`EventsController.cs:42`); no backend work.
7. Audit findings FP-01, FP-02, FP-03, FP-04 (Critical) are all addressed: Tasks 1.4, 1.4, 1.5+2.7, 1.3.
8. Audit findings FP-05 through FP-13 (High) are all addressed: 2.3, 1.5, 2.7, 3.1+3.2, [FP-09 out-of-scope], 1.1, 1.2, 2.1, 2.2.
9. Audit findings FP-16, FP-17, FP-18, FP-19, FP-21 (Medium) are addressed: 3.2, 0.1, 2.5, 3.3, 2.8.
