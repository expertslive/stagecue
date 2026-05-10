import { describe, it, expect } from "vitest";
import { activeThreshold, colorTokenForRemaining } from "@/lib/thresholds";

const list = [
  { secondsRemaining: 600, colorToken: "warning" },
  { secondsRemaining: 120, colorToken: "danger" },
  { secondsRemaining: 30, colorToken: "final" },
];

describe("activeThreshold", () => {
  it("picks the smallest matching threshold", () => {
    expect(activeThreshold(list, 700_000)).toBeNull();
    expect(activeThreshold(list, 500_000)?.colorToken).toBe("warning");
    expect(activeThreshold(list, 100_000)?.colorToken).toBe("danger");
    expect(activeThreshold(list, 20_000)?.colorToken).toBe("final");
    expect(activeThreshold(list, 0)).toBeNull();
  });
});

describe("colorTokenForRemaining", () => {
  it("returns --primary when above all thresholds", () => {
    expect(colorTokenForRemaining(list, 700_000)).toBe("var(--primary)");
  });
  it("returns --overrun when ≤ 0", () => {
    expect(colorTokenForRemaining(list, -100)).toBe("var(--overrun)");
    expect(colorTokenForRemaining(list, 0)).toBe("var(--overrun)");
  });
  it("returns the matching threshold's token", () => {
    expect(colorTokenForRemaining(list, 100_000)).toBe("var(--danger)");
  });
});
