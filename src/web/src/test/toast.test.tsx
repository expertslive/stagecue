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
