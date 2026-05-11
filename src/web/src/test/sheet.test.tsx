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
