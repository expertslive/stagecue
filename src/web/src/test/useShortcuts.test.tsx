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
