import { describe, it, expect } from "vitest";
import { formatRemaining } from "@/lib/time";

describe("formatRemaining", () => {
  it("formats sub-hour positive remaining as MM:SS", () => {
    expect(formatRemaining(125_000)).toBe("02:05");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(59_999)).toBe("00:59");
  });
  it("formats hour-or-more as H:MM:SS", () => {
    expect(formatRemaining(3_660_000)).toBe("1:01:00");
  });
  it("formats negative as overrun with +", () => {
    expect(formatRemaining(-30_000)).toBe("+00:30");
    expect(formatRemaining(-3_660_000)).toBe("+1:01:00");
  });
});
