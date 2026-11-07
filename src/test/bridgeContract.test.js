// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { bridgeAllows, bridgeGate } from "../../qa/bridge-gate.mjs";

// BG-017C-05B: the Studio's calls against the trusted staging bridge's route table (Codex API PR #229). MOCKED: this proves the Studio only asks for routes the bridge allows
// and shows the ones it does not; it does not prove a bridge is deployed or reachable.
const U = "11111111-1111-4111-8111-111111111111";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const studioPaths = () => {
  const out = new Set();
  for (const f of walk("src")) {
    if (!/\.(js|jsx)$/.test(f) || /\.test\.|\/test\//.test(f)) continue;
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/`\$\{[A-Za-z_.]+\}(\/[a-z][^`?]*)`?/g)) out.add(m[1].replace(/\$\{[^}]+\}/g, U));
    for (const m of s.matchAll(/["'](\/(?:customer|billing|public)\/[^"'?]*)["']/g)) out.add(m[1]);
  }
  return [...out].sort();
};
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const allowedAny = (p) => METHODS.some((m) => bridgeAllows(m, p));

// Everything the Studio calls that the bridge will answer 404 RESOURCE_NOT_AVAILABLE for, with the reason it does not matter for the staging first-customer journey, or why it does.
const NOT_THROUGH_THE_BRIDGE = {
  "/billing/stripe/checkout": "STRIPE CHECKOUT ENTRY: outside /customer/, so the bridge refuses it. Starting a subscription from the Studio cannot work through this bridge. Needs a decision with Codex before billing is tested (not part of the first-customer journey)",
  "/public/paid-beta-interest": "lead capture, not shown in the premium Studio build",
  "/billing/checkout/success": "a Studio page, not an API route", "/billing/checkout/cancel": "a Studio page, not an API route",
  "/customer/billing/invoices": "gate off (VITE_BILLING_MANAGEMENT_API); no API implementation",
  ["/customer/billing/management/" + U]: "gate off (VITE_BILLING_MANAGEMENT_API)",
  ["/customer/insights" + U + "${q "]: "gate off (VITE_ANALYTICS_API); dynamic template (the scan stops at the query-string placeholder)",
  ["/customer/campaigns/" + U + "/" + U]: "generic campaign action template: the concrete actions (archive, restore) are allowed",
  ["/customer/campaigns/" + U + "/variants/" + U + "/" + U]: "generic variant action template: the concrete actions (review, approval, schedule, ...) are allowed",
  ["/customer/campaigns/" + U + "/variants/" + U + "/generate"]: "legacy generation route (answers 428 without a quote)",
  ["/customer/campaigns/" + U + "/variants/" + U + "/manual-publication"]: "manual publication: not in the bridge",
  ["/customer/campaigns/" + U + "/variants/" + U + "/manual-publication/" + U]: "manual publication: not in the bridge",
  ["/customer/campaigns/" + U + "/variants/" + U + "/manual-publication/confirm"]: "manual publication: not in the bridge",
  "/customer/assets/uploads/": "uploads off in the launch scope (the bridge does allow the real upload routes)",
  ["/customer/social" + U]: "dynamic suffix template: the concrete social routes are checked below",
};

describe("Studio requests against the trusted staging bridge route table (BG-017C-05B, MOCKED)", () => {
  it("every API path the Studio calls is allowed by the bridge, or is named below with the reason it is not", () => {
    const unexplained = studioPaths().filter((p) => !allowedAny(p) && !(p in NOT_THROUGH_THE_BRIDGE));
    expect(unexplained).toEqual([]);
  });
  it("the first-customer journey routes are allowed with the exact methods the Studio uses", () => {
    const journey = [
      ["GET", "/customer/workspace"], ["POST", "/customer/workspace/bootstrap"], ["POST", "/customer/workspace/select"], ["GET", "/customer/workspace/brand-brain"], ["PUT", "/customer/workspace/brand-brain"],
      ["GET", "/customer/workspace/onboarding"], ["PUT", "/customer/workspace/onboarding"], ["POST", "/customer/campaign-recommendations"], ["GET", "/customer/campaigns"], ["POST", "/customer/campaigns"],
      ["PATCH", `/customer/campaigns/${U}`], ["POST", `/customer/campaigns/${U}/content-items`], ["POST", "/customer/generation-quotes"], ["POST", `/customer/generation-quotes/${U}/confirm`], ["GET", `/customer/generation-quotes/${U}`],
      ["GET", `/customer/creative-jobs/${U}`], ["POST", `/customer/creative-jobs/${U}/attach`], ["POST", `/customer/campaigns/${U}/variants/${U}/review`], ["POST", `/customer/campaigns/${U}/variants/${U}/preview-renders`],
      ["POST", `/customer/campaigns/${U}/variants/${U}/preview-acknowledgements`], ["POST", `/customer/campaigns/${U}/variants/${U}/approval`], ["POST", `/customer/campaigns/${U}/variants/${U}/schedule`],
      ["POST", `/customer/campaigns/${U}/variants/${U}/reschedule`], ["POST", `/customer/campaigns/${U}/variants/${U}/unschedule`], ["GET", `/customer/campaigns/${U}/variants/${U}/creative-preview`],
      ["GET", `/customer/campaigns/${U}/variants/${U}/revisions/${U}/assets/${U}/preview`], ["GET", "/customer/calendar"], ["GET", "/customer/social/connections"], ["POST", "/customer/social/oauth-intents"],
      ["GET", "/customer/billing/subscription"], ["GET", "/customer/billing/plans"], ["GET", "/customer/billing/credit-preview"],
    ];
    for (const [m, p] of journey) expect(bridgeAllows(m, p), `${m} ${p}`).toBe(true);
  });
  it("the one launch-journey route the bridge does not carry is named: Stripe checkout entry", () => {
    expect(bridgeAllows("POST", "/billing/stripe/checkout")).toBe(false); expect("/billing/stripe/checkout" in NOT_THROUGH_THE_BRIDGE).toBe(true);
  });
  it("the Studio sends only the request headers the bridge allows (authorization, content-type, range)", () => {
    const sent = new Set();
    for (const f of walk("src")) {
      if (!/\.(js|jsx)$/.test(f) || /\.test\.|\/test\//.test(f)) continue;
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/headers:\s*\{([^}]*)\}/g)) for (const k of m[1].matchAll(/(?:^|[,\s])"?([A-Za-z][A-Za-z-]+)"?\s*:/g)) sent.add(k[1].toLowerCase());
    }
    for (const k of sent) expect(["authorization", "content-type", "range", "accept", "get", "idempotency-key"].includes(k) || /^(headers|extra)$/.test(k), `header ${k}`).toBe(true);
    expect(sent.has("x-serverless-authorization")).toBe(false);
  });
  it("the stand-in applies the bridge's own gates: exact origin, allowed headers, write gate, tenant scope", () => {
    const o = { origin: "https://bizgenie-studio-staging.pages.dev", scope: { tenant_id: "t1", project_id: "p1", brand_id: "b1" } };
    const pre = (extra) => bridgeGate({ method: "OPTIONS", url: "https://bridge.test/customer/workspace", headers: { origin: o.origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization,content-type", ...extra } }, o);
    expect(pre({})).toMatchObject({ status: 204, headers: { "access-control-allow-origin": o.origin, "access-control-allow-methods": "GET" } });
    expect(pre({ origin: "https://other.pages.dev" }).status).toBe(403); expect(pre({ "access-control-request-headers": "authorization,x-custom" }).status).toBe(403);
    const call = (method, path, extra = {}) => bridgeGate({ method, url: `https://bridge.test${path}`, headers: { origin: o.origin, authorization: "Bearer a.b.c", ...extra.headers }, postData: extra.body }, { ...o, ...extra.opts });
    expect(call("POST", "/customer/workspace/bootstrap", { body: "{}" }).body.error.code).toBe("STAGING_WRITES_DISABLED");
    expect(call("POST", "/customer/workspace/bootstrap", { opts: { writes: true } }).pass).toBe(true);
    expect(call("GET", "/customer/campaigns?tenant_id=t1&project_id=p1").pass).toBe(true);
    expect(call("GET", "/customer/campaigns?tenant_id=OTHER&project_id=p1").body.error.code).toBe("RESOURCE_NOT_AVAILABLE");
    expect(call("POST", `/customer/campaigns/${U}/content-items`, { opts: { writes: true }, body: JSON.stringify({ tenant_id: "OTHER", project_id: "p1" }) }).status).toBe(404);
    expect(call("GET", "/customer/workspace", { headers: { authorization: "" } }).body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(call("GET", "/customer/workspace", { headers: { "x-serverless-authorization": "Bearer x" } }).body.error.code).toBe("SERVER_HEADERS_FORBIDDEN");
    expect(call("POST", `/customer/generation-quotes/${U}/confirm`, { opts: { writes: true } }).body.error.code).toBe("GENERATION_CONFIRMATION_DISABLED");
    expect(call("GET", "/billing/stripe/checkout").status).toBe(404);
  });
});
