import { describe, expect, it } from "vitest";
import { normalizeMobileE164 } from "../src/parent-auth/mobile.js";

describe("normalizeMobileE164 (international)", () => {
  it("preserves Indian +91 national numbers as E.164", () => {
    expect(normalizeMobileE164("9876543210", "+91")).toBe("+919876543210");
    expect(normalizeMobileE164("+919876543210", "+91")).toBe("+919876543210");
  });

  it("normalizes United States +1", () => {
    expect(normalizeMobileE164("2025550123", "+1")).toBe("+12025550123");
  });

  it("normalizes United Kingdom +44", () => {
    expect(normalizeMobileE164("7400123456", "+44")).toBe("+447400123456");
  });

  it("normalizes United Arab Emirates +971", () => {
    expect(normalizeMobileE164("501234567", "+971")).toBe("+971501234567");
  });

  it("normalizes Australia +61", () => {
    expect(normalizeMobileE164("412345678", "+61")).toBe("+61412345678");
  });

  it("normalizes Singapore +65", () => {
    expect(normalizeMobileE164("81234567", "+65")).toBe("+6581234567");
  });

  it("rejects invalid numbers", () => {
    expect(() => normalizeMobileE164("123", "+91")).toThrow();
  });
});
