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
  it("surfaces Identity validation errors from the body", () => {
    const err = new ApiError(400, "Bad Request", {
      errors: [
        { code: "PasswordTooShort", description: "Passwords must be at least 10 characters." },
        { code: "PasswordRequiresDigit", description: "Passwords must have at least one digit." },
      ],
    });
    const msg = apiErrorMessage(err);
    expect(msg).toMatch(/at least 10 characters/);
    expect(msg).toMatch(/at least one digit/);
  });
  it("surfaces ModelState validation errors from the body", () => {
    const err = new ApiError(400, "Bad Request", {
      errors: {
        Email: ["Email is required."],
        Name: ["Name is required.", "Name must be at most 80 characters."],
      },
    });
    const msg = apiErrorMessage(err);
    expect(msg).toMatch(/email is required/i);
    expect(msg).toMatch(/name is required/i);
    expect(msg).toMatch(/at most 80 characters/i);
  });
  it("humanises short error codes like AlreadyInitialized", () => {
    const err = new ApiError(409, "Conflict", { error: "AlreadyInitialized" });
    expect(apiErrorMessage(err)).toBe("Already initialized.");
  });
  it("falls back to friendly 400 copy when body has no structured errors", () => {
    const err = new ApiError(400, "Bad Request", "some unparseable text");
    expect(apiErrorMessage(err)).toMatch(/check the form/i);
  });
});
