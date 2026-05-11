import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import HoldToConfirm from "@/components/ui/HoldToConfirm";

describe("HoldToConfirm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Drive rAF with fake timers so we can advance the hold programmatically.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires onConfirm after the hold duration elapses", () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm onConfirm={onConfirm} durationMs={200}>
        Reset
      </HoldToConfirm>,
    );
    const btn = screen.getByTestId("hold-to-confirm");
    fireEvent.pointerDown(btn);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not fire if pointer is released before the duration elapses", () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm onConfirm={onConfirm} durationMs={500}>
        Reset
      </HoldToConfirm>,
    );
    const btn = screen.getByTestId("hold-to-confirm");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerUp(btn);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("cancels when the pointer leaves the button", () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm onConfirm={onConfirm} durationMs={500}>
        Reset
      </HoldToConfirm>,
    );
    const btn = screen.getByTestId("hold-to-confirm");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerLeave(btn);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not fire when disabled", () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirm onConfirm={onConfirm} durationMs={200} disabled>
        Reset
      </HoldToConfirm>,
    );
    const btn = screen.getByTestId("hold-to-confirm");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("exposes data-holding while active", () => {
    render(
      <HoldToConfirm onConfirm={() => {}} durationMs={500}>
        Reset
      </HoldToConfirm>,
    );
    const btn = screen.getByTestId("hold-to-confirm");
    expect(btn.getAttribute("data-holding")).toBe("false");
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(btn.getAttribute("data-holding")).toBe("true");
    fireEvent.pointerUp(btn);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(btn.getAttribute("data-holding")).toBe("false");
  });
});
