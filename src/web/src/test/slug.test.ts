import { describe, it, expect } from "vitest";
import { deriveSlug } from "@/lib/slug";

describe("deriveSlug", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(deriveSlug("My Organisation")).toBe("my-organisation");
  });
  it("strips punctuation", () => {
    expect(deriveSlug("Acme, Inc.")).toBe("acme-inc");
  });
  it("collapses consecutive separators", () => {
    expect(deriveSlug("Foo  --  Bar")).toBe("foo-bar");
  });
  it("trims leading and trailing separators", () => {
    expect(deriveSlug("  -Foo-  ")).toBe("foo");
  });
  it("falls back to 'org' for empty input", () => {
    expect(deriveSlug("")).toBe("org");
    expect(deriveSlug("   ")).toBe("org");
  });
  it("transliterates simple accents", () => {
    expect(deriveSlug("Café")).toBe("cafe");
  });
});
