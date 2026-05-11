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
