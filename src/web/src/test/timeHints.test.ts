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
