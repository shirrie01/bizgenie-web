import { describe, expect, it } from "vitest";
import { toSafeAuthMessage } from "../authErrors";

describe("toSafeAuthMessage", () => {
  it("maps invalid credentials to a safe message", () => {
    const message = toSafeAuthMessage({ code: "invalid_credentials", message: "Invalid login credentials" });
    expect(message).toBe("That email and password combination doesn't match an account.");
  });

  it("maps duplicate sign-up to a safe message", () => {
    const message = toSafeAuthMessage({ message: "User already registered" });
    expect(message).toBe("An account with that email already exists. Try signing in instead.");
  });

  it("maps rate limiting to a safe message", () => {
    const message = toSafeAuthMessage({ code: "over_request_rate_limit", message: "rate limit exceeded" });
    expect(message).toBe("Too many attempts. Please wait a moment and try again.");
  });

  it("falls back to a generic message for unrecognized errors", () => {
    const message = toSafeAuthMessage({ message: "unexpected provider failure" });
    expect(message).toBe("Something went wrong. Please try again.");
  });

  it("never echoes raw provider text, tokens, or database detail back to the caller", () => {
    const dangerousInputs = [
      { message: "duplicate key value violates unique constraint \"users_email_key\" on table \"auth.users\"" },
      { message: "jwt malformed: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret.signature" },
      { message: "password authentication failed for user \"postgres\" at host db.internal" },
      { code: "service_role_required", message: "service_role key missing" },
    ];

    for (const error of dangerousInputs) {
      const message = toSafeAuthMessage(error);
      expect(message).not.toContain("postgres");
      expect(message).not.toContain("jwt");
      expect(message).not.toContain("service_role");
      expect(message).not.toContain("constraint");
      expect(message).not.toContain("auth.users");
      expect(message).not.toMatch(/eyJ/); // no raw JWT fragments
    }
  });

  it("returns an empty string for a falsy error", () => {
    expect(toSafeAuthMessage(null)).toBe("");
    expect(toSafeAuthMessage(undefined)).toBe("");
  });
});
