import { describe, expect, it } from "vitest";
import { rehearsalSkew } from "./rehearsal";

describe("rehearsalSkew", () => {
  it("returns the server skew when rehearsal is disabled", () => {
    expect(rehearsalSkew({ enabled: false, speed: 10, baseSkewMs: 1000, anchorNowMs: 10_000, nowMs: 16_000 })).toBe(1000);
  });

  it("advances elapsed display time by the selected speed", () => {
    expect(rehearsalSkew({ enabled: true, speed: 10, baseSkewMs: 1000, anchorNowMs: 10_000, nowMs: 16_000 })).toBe(55_000);
  });
});
