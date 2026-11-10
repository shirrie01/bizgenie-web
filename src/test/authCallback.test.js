// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { classifyAuthCallback, scrubAuthParams, consumeAuthCallback, resetAuthCallbackForTests } from "../authCallback.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijklmnop";
describe("email link callback handling (BG-LAUNCH-019)", () => {
  beforeEach(() => { resetAuthCallbackForTests(); window.history.replaceState(null, "", "/"); });
  it("an expired link is classified as expired with a recovery message", () => {
    const r = classifyAuthCallback("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(r.kind).toBe("expired"); expect(r.message).toMatch(/expired.*new confirmation email/i);
    expect(classifyAuthCallback("", "?error_code=otp_expired").kind).toBe("expired");
    expect(classifyAuthCallback("#error=access_denied&error_description=link+has+expired").kind).toBe("expired");
  });
  it("another failed link is a generic failure; a good link says the email is confirmed; nothing else is a callback", () => {
    expect(classifyAuthCallback("#error=server_error&error_code=unexpected_failure").kind).toBe("failed");
    expect(classifyAuthCallback(`#access_token=${JWT}&refresh_token=r&type=signup`)).toMatchObject({ kind: "confirmed" });
    expect(classifyAuthCallback("#/billing", "?x=1")).toBeNull(); expect(classifyAuthCallback("", "")).toBeNull();
  });
  it("the result never contains a token", () => {
    expect(JSON.stringify(classifyAuthCallback(`#access_token=${JWT}&refresh_token=secretrefresh&type=signup`))).not.toMatch(/eyJ|secretrefresh/);
  });
  it("removes every auth parameter from the address (fragment and query) and keeps the rest", () => {
    window.history.replaceState(null, "", `/billing/checkout/success?session=abc&error_code=otp_expired#access_token=${JWT}&type=signup&keep=1`);
    expect(scrubAuthParams()).toBe(true);
    expect(window.location.pathname).toBe("/billing/checkout/success"); expect(window.location.search).toBe("?session=abc"); expect(window.location.hash).toBe("#keep=1");
    expect(window.location.href).not.toMatch(/eyJ|access_token|error_code/);
    expect(scrubAuthParams()).toBe(false);
  });
  it("consuming returns the notice once and cleans the address; later calls (a second render) get the same answer", () => {
    window.history.replaceState(null, "", "/#error=access_denied&error_code=otp_expired");
    const first = consumeAuthCallback(); expect(first.kind).toBe("expired"); expect(window.location.hash).toBe("");
    expect(consumeAuthCallback()).toBe(first);
  });
  it("an address with no auth parameters is left alone", () => {
    const spy = vi.spyOn(window.history, "replaceState"); window.history.replaceState(null, "", "/billing/checkout/success"); spy.mockClear();
    expect(consumeAuthCallback()).toBeNull(); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
});
