import { describe, expect, it } from "vitest";
import { CALLBACK_PATH, RETURN_MESSAGE, looksLikeOAuthReturn, readOAuthReturn } from "./oauthReturn";

// Pure checks of the browser's return from a social platform (BG-LAUNCH-CLOSURE-10). No network, no storage, no navigation.
const STATE = "A".repeat(43), CODE = "code_0123456789";
const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const pending = (o = {}) => ({ intentId: "i", state: STATE, verifier: "v".repeat(43), provider: "linkedin", expiresAt: new Date(Date.now() + 60000).toISOString(), scope, ...o });
const read = (o) => readOAuthReturn({ pathname: "/customer/social/oauth/callback/linkedin", search: `?code=${CODE}&state=${STATE}`, pending: pending(), scope, ...o });

describe("readOAuthReturn", () => {
  it("accepts a valid Studio-hosted return and a valid legacy relay return, and nothing else is read from them", () => {
    expect(read()).toEqual({ kind: "ready", provider: "linkedin", code: CODE, state: STATE });
    expect(read({ pathname: "/" })).toEqual({ kind: "ready", provider: "linkedin", code: CODE, state: STATE });
    expect(read({ pathname: "/customer/social/oauth/callback/linkedin/" }).kind).toBe("ready");
  });
  it("does nothing for an ordinary page load", () => {
    expect(readOAuthReturn({ pathname: "/", search: "" })).toEqual({ kind: "none" });
    expect(readOAuthReturn({ pathname: "/billing/checkout/success", search: "?session=x" })).toEqual({ kind: "none" });
    expect(looksLikeOAuthReturn("/", "")).toBe(false); expect(looksLikeOAuthReturn("/customer/social/oauth/callback/tiktok", "")).toBe(true); expect(looksLikeOAuthReturn("/", "?error=access_denied")).toBe(true);
  });
  const refuse = (name, o, reason) => it(`refuses ${name}`, () => expect(read(o)).toEqual({ kind: "invalid", reason }));
  refuse("a missing state", { search: `?code=${CODE}` }, "MISSING_PARAMS");
  refuse("a missing code", { search: `?state=${STATE}` }, "MISSING_PARAMS");
  refuse("an invalid state (not the stored one)", { search: `?code=${CODE}&state=${"B".repeat(43)}` }, "STATE_MISMATCH");
  refuse("a malformed state (too short)", { search: `?code=${CODE}&state=short` }, "MALFORMED");
  refuse("a malformed state (bad characters)", { search: `?code=${CODE}&state=${"A".repeat(42)}!` }, "MALFORMED");
  refuse("a malformed code (whitespace)", { search: `?code=${encodeURIComponent("a b")}&state=${STATE}` }, "MALFORMED");
  refuse("a malformed code (over 4096)", { search: `?code=${"a".repeat(4097)}&state=${STATE}` }, "MALFORMED");
  refuse("duplicated code", { search: `?code=${CODE}&code=x&state=${STATE}` }, "MALFORMED");
  refuse("duplicated state", { search: `?code=${CODE}&state=${STATE}&state=${STATE}` }, "MALFORMED");
  refuse("an expired attempt", { pending: pending({ expiresAt: new Date(Date.now() - 1).toISOString() }) }, "EXPIRED");
  refuse("a replayed return (no stored attempt)", { pending: null }, "NO_PENDING");
  refuse("a stored attempt without a state", { pending: { provider: "linkedin" } }, "NO_PENDING");
  refuse("the wrong provider in the path", { pending: pending({ provider: "tiktok" }) }, "PROVIDER_MISMATCH");
  refuse("an unknown provider in the path", { pathname: "/customer/social/oauth/callback/myspace" }, "UNKNOWN_PROVIDER");
  refuse("a stored attempt for an unknown provider", { pathname: "/", pending: pending({ provider: "myspace" }) }, "PROVIDER_MISMATCH");
  refuse("an attempt started in another tenant", { pending: pending({ scope: { ...scope, tenantId: "other" } }) }, "SCOPE_MISMATCH");
  refuse("an attempt started in another project", { pending: pending({ scope: { ...scope, projectId: "other" } }) }, "SCOPE_MISMATCH");
  refuse("an attempt started in another brand", { pending: pending({ scope: { ...scope, brandId: "other" } }) }, "SCOPE_MISMATCH");
  it("reports a provider error callback (consent refused) without reading or echoing its description", () => {
    const r = read({ search: `?error=access_denied&error_description=${encodeURIComponent("<script>alert(1)</script>")}&state=${STATE}` });
    expect(r).toEqual({ kind: "provider_error", provider: "linkedin" }); expect(JSON.stringify(r)).not.toContain("script");
    expect(readOAuthReturn({ pathname: "/", search: "?error=server_error", pending: null })).toEqual({ kind: "provider_error", provider: null });
  });
  it("an error callback that also carries a code is treated as a normal (checked) return, never as consent refused", () => {
    expect(read({ search: `?error=x&code=${CODE}&state=${STATE}` }).kind).toBe("ready");
  });
  it("never produces a URL or a navigation target: the result has no address field, whatever the query contains", () => {
    const r = read({ search: `?code=${CODE}&state=${STATE}&redirect=https://evil.example&next=//evil.example&return_to=javascript:1` });
    expect(Object.keys(r).sort()).toEqual(["code", "kind", "provider", "state"]); expect(JSON.stringify(r)).not.toMatch(/evil|javascript/);
  });
  it("every refusal has a fixed customer message that contains no query value", () => {
    for (const reason of ["NO_PENDING", "STATE_MISMATCH", "PROVIDER_MISMATCH", "SCOPE_MISMATCH", "EXPIRED", "MALFORMED", "MISSING_PARAMS", "UNKNOWN_PROVIDER", "NOT_OWNER", "UNAVAILABLE", "provider_error"]) expect(RETURN_MESSAGE[reason]).toMatch(/nothing was connected/);
    expect(CALLBACK_PATH.test("/customer/social/oauth/callback/linkedin")).toBe(true); expect(CALLBACK_PATH.test("/customer/social/oauth/callback/linkedin/extra")).toBe(false); expect(CALLBACK_PATH.test("/x/customer/social/oauth/callback/linkedin")).toBe(false);
  });
});
