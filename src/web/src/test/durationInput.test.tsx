import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import DurationInput from "@/components/ui/DurationInput";
import { formatMmss, parseDuration } from "@/lib/duration";

describe("formatMmss", () => {
  it("pads seconds to two digits", () => {
    expect(formatMmss(0)).toBe("0:00");
    expect(formatMmss(5)).toBe("0:05");
    expect(formatMmss(65)).toBe("1:05");
    expect(formatMmss(1800)).toBe("30:00");
  });
  it("floors negatives to zero", () => {
    expect(formatMmss(-10)).toBe("0:00");
  });
});

describe("parseDuration", () => {
  it("parses MM:SS", () => {
    expect(parseDuration("12:30")).toBe(750);
    expect(parseDuration("0:05")).toBe(5);
  });
  it("parses raw seconds", () => {
    expect(parseDuration("60")).toBe(60);
  });
  it("rejects invalid", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:99")).toBeNull();
  });
  it("treats empty as zero", () => {
    expect(parseDuration("")).toBe(0);
  });
});

describe("DurationInput", () => {
  it("renders the formatted value", () => {
    render(<DurationInput value={1800} onChange={() => {}} aria-label="duration" />);
    expect(screen.getByLabelText("duration")).toHaveValue("30:00");
  });
  it("commits on blur", () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} aria-label="duration" />);
    const input = screen.getByLabelText("duration");
    fireEvent.change(input, { target: { value: "5:30" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(330);
  });
  it("clamps to max", () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} max={120} aria-label="duration" />);
    const input = screen.getByLabelText("duration");
    fireEvent.change(input, { target: { value: "10:00" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(120);
  });
  it("marks invalid input", () => {
    const onChange = vi.fn();
    render(<DurationInput value={60} onChange={onChange} aria-label="duration" />);
    const input = screen.getByLabelText("duration");
    fireEvent.change(input, { target: { value: "nope" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
