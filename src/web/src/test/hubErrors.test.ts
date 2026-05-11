import { describe, it, expect } from "vitest";
import { humaniseHubError } from "@/lib/hubErrors";

describe("humaniseHubError", () => {
  it("recognises VersionMismatch", () => {
    expect(humaniseHubError(new Error("Microsoft.AspNetCore.SignalR.HubException: VersionMismatch"))).toMatch(/another operator|out of date/i);
  });
  it("recognises StaleVersion (alias)", () => {
    expect(humaniseHubError(new Error("HubException: StaleVersion"))).toMatch(/another operator|out of date/i);
  });
  it("recognises InvalidPhase", () => {
    expect(humaniseHubError(new Error("HubException: InvalidPhase"))).toMatch(/not the right time|can't.* now/i);
  });
  it("recognises NoNextItem", () => {
    expect(humaniseHubError(new Error("HubException: NoNextItem"))).toMatch(/nothing to skip|no more/i);
  });
  it("falls back for unknown errors", () => {
    expect(humaniseHubError(new Error("Some weird thing"))).toMatch(/something went wrong/i);
  });
});
