// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildQuoteRequest, requestGenerationQuote, confirmGenerationQuote, EXECUTION_CLASSES, EXECUTION_STATES } from "../premium/generationQuoteClient.js";
import { addContentItem, submitForReview, unscheduleVariant } from "../premium/campaignManagementClient.js";

// BG-LAUNCH-015: the Studio's customer-API calls checked against Codex's BG-LAUNCH-012 contract (vendored extract, MOCKED transport).
// This proves the Studio sends what the contract documents; it does not prove the deployed API implements the contract.
const C = JSON.parse(readFileSync("qa/contracts/BG_LAUNCH_012_CUSTOMER_API.extract.json", "utf8"));
const U = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222", R = "33333333-3333-4333-8333-333333333333";
const scope = { tenantId: U, projectId: U, brandId: U };
const campaign = { campaign_id: U, version: 4 }; const variant = { variant_id: V };

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const norm = (p) => p.replace(/\$\{[^}]+\}/g, ":id").replace(/\/[0-9a-f-]{36}(?=\/|$)/g, "/:id");
const segs = (p) => p.split("/").filter(Boolean);
const matches = (path, tmpl) => { const a = segs(path), b = segs(tmpl); return a.length === b.length && a.every((x, i) => x === b[i] || x === ":id" || b[i] === ":id"); };

// Studio source paths. Anything outside the contract must be named here with its reason, so a new, undocumented call fails this test.
const OUTSIDE_CONTRACT = {
  // Used in the first-customer journey and implemented in API #226, but absent from the contract (for Codex to add):
  "/customer/workspace/bootstrap": "workspace creation (POST); implemented, tested in API #226",
  "/customer/campaign-recommendations": "recommendation (POST); implemented",
  "/customer/campaigns": "campaign list (GET); implemented",
  // Behind capability gates that are OFF in the staging manifest, or legacy:
  "/customer/assets": "customer media (gate VITE_CUSTOMER_MEDIA_INTAKE_API, off)", "/customer/assets/:id": "same", "/customer/assets/:id/complete": "same", "/customer/assets/:id/preview": "same", "/customer/assets/:id/revoke": "same", "/customer/assets/uploads": "same", "/customer/assets/uploads/": "same",
  "/customer/billing/credit-preview": "gate off", "/customer/billing/invoices": "gate off; NOT FOUND in API #226 source", "/customer/billing/management/:id": "gate off",
  "/customer/campaigns/:id/calendar": "campaign calendar", "/customer/campaigns/:id/measurements": "analytics gate, off", "/customer/campaigns/:id/variants/:id/measurements": "analytics gate, off",
  "/customer/campaigns/:id/variants/:id/generate": "legacy route (428 without a quote)", "/customer/campaigns/:id/variants/:id/manual-publication": "manual publication", "/customer/campaigns/:id/variants/:id/manual-publication/:id": "manual publication", "/customer/campaigns/:id/variants/:id/manual-publication/confirm": "manual publication",
  "/customer/creative-jobs": "job list", "/customer/creative-jobs/:id/cancel": "job cancel (generation_cancel is on the quote)",
  "/customer/insights:id${q ": "analytics gate, off (dynamic template)", "/customer/social:id": "social routes built from a dynamic suffix (checked separately)",
  "/customer/campaigns/:id/:id": "generic campaign action template (rename/archive/restore)", "/customer/campaigns/:id/variants/:id/:id": "generic variant action template (schedule/reschedule/...)",
};
const studioPaths = () => {
  const out = new Set();
  for (const f of walk("src")) {
    if (!/\.(js|jsx)$/.test(f) || /\.test\.|\/test\//.test(f)) continue;
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/`\$\{[A-Za-z_.]+\}(\/customer\/[^`?]*)/g)) out.add(norm(m[1]));
    for (const m of s.matchAll(/["'](\/customer\/[^"'?]*)["']/g)) out.add(norm(m[1]));
  }
  return [...out].sort();
};

describe("Studio requests vs BG-LAUNCH-012 contract (BG-LAUNCH-015)", () => {
  it("every /customer path the Studio calls is in the contract or is named, with a reason, as outside it", () => {
    const unknown = studioPaths().filter((p) => !C.endpoints.some((e) => matches(p, e.path)) && !(p in OUTSIDE_CONTRACT));
    expect(unknown).toEqual([]);
  });
  it("the journey-critical contract endpoints are all called by the Studio", () => {
    const paths = studioPaths();
    for (const id of ["workspaces", "select_workspace", "brand_read", "brand_save", "onboarding", "onboarding_save", "campaign_create", "content_item", "generation_quote", "generation_confirm", "generation_status", "creative_job", "creative_preview", "media_bytes", "calendar", "review", "preview-renders", "preview-acknowledgements", "approval", "unschedule", "credit_read"]) {
      const e = C.endpoints.find((x) => x.id === id);
      expect(paths.some((p) => matches(p, e.path)), `${id} ${e.path}`).toBe(true);
    }
  });
  it("the social routes (built from a suffix) are the contract's, and no unlisted social path is used", () => {
    const src = readFileSync("src/premium/socialClient.js", "utf8");
    for (const id of ["connections", "oauth_intent", "oauth_complete", "disconnect"]) {
      const e = C.endpoints.find((x) => x.id === id); const parts = e.path.replace("/customer/social", "").split("/:id");
      for (const part of parts.filter(Boolean)) expect(src.includes(part), `${id} ${e.path} (${part})`).toBe(true);
    }
    expect(src).toMatch(/\/customer\/social/);
  });
  it("shared vocabularies match: execution classes, and every contract job state is one the Studio knows", () => {
    expect(EXECUTION_CLASSES).toEqual(C.execution_classes);
    for (const s of C.job_states) expect(EXECUTION_STATES).toContain(s);
  });

  const record = async (fn) => { const seen = []; const fetchImpl = async (url, init) => { seen.push({ url: String(url), method: (init && init.method) || "GET", body: init && init.body ? JSON.parse(init.body) : null }); return new Response("{}", { status: 500 }); }; try { await fn(fetchImpl); } catch { /* the reply is irrelevant: the request is what is checked */ } return seen[0]; };
  const within = (id, body) => { const e = C.endpoints.find((x) => x.id === id); const allowed = new Set([...(e.request_fields || []), ...(e.optional_fields || [])]); expect(Object.keys(body).filter((k) => !allowed.has(k)), `${id}: fields the contract does not list`).toEqual([]); expect((e.request_fields || []).filter((k) => !(k in body)), `${id}: required fields missing`).toEqual([]); };
  const base = { apiBaseUrl: "http://api.test", accessToken: "t", scope };

  it("generation quote request carries exactly the contract's fields", async () => {
    const request = buildQuoteRequest({ scope, campaign, variant, executionClass: "text.standard" });
    const r = await record((fetchImpl) => requestGenerationQuote({ ...base, request, nonce: "n1", fetchImpl }));
    expect(r.method).toBe("POST"); expect(matches(new URL(r.url).pathname, "/customer/generation-quotes")).toBe(true); within("generation_quote", r.body);
  });
  it("generation confirm sends confirmed:true with the quoted credits and nothing else", async () => {
    const quote = { quoteId: "q1", binding: true, sufficient: true, authorisedCredits: 7 };
    const r = await record((fetchImpl) => confirmGenerationQuote({ ...base, quote, key: "c:abc", fetchImpl }));
    expect(new URL(r.url).pathname).toBe("/customer/generation-quotes/q1/confirm"); within("generation_confirm", r.body); expect(r.body).toMatchObject({ confirmed: true, max_credits: 7 });
  });
  it("add content item, submit for review and unschedule carry the contract's fields", async () => {
    let r = await record((fetchImpl) => addContentItem({ ...base, campaign, name: "Post", format: "text", platform: "instagram", placement: "feed", destinationLabel: "Instagram", fetchImpl }));
    within("content_item", r.body);
    r = await record((fetchImpl) => submitForReview({ ...base, campaign, variant, revisionId: R, fetchImpl })); within("review", r.body);
    r = await record((fetchImpl) => unscheduleVariant({ ...base, campaign, variant: { ...variant, workflow: "scheduled" }, scheduleId: R, fetchImpl })); within("unschedule", r.body);
  });
  it("no request body carries a client-chosen identity beyond the scope selectors the contract lists", async () => {
    const r = await record((fetchImpl) => requestGenerationQuote({ ...base, request: buildQuoteRequest({ scope, campaign, variant, executionClass: "text.standard" }), nonce: "n1", fetchImpl }));
    for (const k of Object.keys(r.body)) expect(k).not.toMatch(/user|auth|role|owner|price|cost|duration|provider/i);
  });
});
