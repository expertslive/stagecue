import { describe, it, expect } from "vitest";
import { apiErrorMessage } from "@/lib/apiErrors";
import { ApiError } from "@/api/client";

describe("apiErrorMessage", () => {
  it("returns auth-specific copy for 401 on sign-in", () => {
    const err = new ApiError(401, "Unauthorized");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/email or password/i);
  });
  it("returns lockout copy for 423", () => {
    const err = new ApiError(423, "Locked");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/locked/i);
  });
  it("returns network copy when status is 0", () => {
    const err = new ApiError(0, "Network down");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/can't reach|network/i);
  });
  it("falls back to a generic-but-humane message", () => {
    const err = new ApiError(500, "Internal Server Error");
    expect(apiErrorMessage(err, "sign-in")).toMatch(/something went wrong/i);
  });
  it("uses default context when no context provided", () => {
    const err = new ApiError(404, "Not Found");
    expect(apiErrorMessage(err)).toBeTruthy();
  });
});
