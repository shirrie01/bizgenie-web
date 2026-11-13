// BG-WEB-LAUNCH-CLOSURE-18: a build flag alone must never show a control that needs a backend capability. Fixture revisions below are test data, never real deployments.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CAPABILITIES, FEATURES, featureAvailability, isMockApiHost, validEntries, verifiedSocialProviders } from "./featureGate";
import { API_COMPATIBILITY } from "./apiCompatibility";
import { isGenerationQuoteApiEnabled } from "./generationQuoteClient";
import { isCustomerMediaApiEnabled } from "./creativeProductionClient";
import { isWorkspaceCalendarApiEnabled } from "./workspaceCalendarApiClient";
import { isUnscheduleApiEnabled } from "./campaignManagementClient";
import { isMediaIntakeApiEnabled, isMediaDeleteApiEnabled } from "./mediaIntakeClient";
import { connectableProviders, isSocialApiEnabled } from "./socialClient";
import { isAnalyticsApiEnabled } from "./insightsClient";
import { isPlanCatalogueApiEnabled } from "./planCatalogueClient";
import { isCreditPreviewApiEnabled } from "./creditPreviewClient";
import { isBillingManagementApiEnabled } from "./billingManagementClient";
import PremiumBilling from "./PremiumBilling";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const SHA = "a".repeat(40), OTHER = "b".repeat(40), REV = "fixture-revision-00001";
const entry = (over = {}) => ({ sourceSha: SHA, servingRevision: REV, verifiedAt: "2026-12-01T00:00:00Z", evidence: "https://example.test/evidence", capabilities: { quotedGeneration: true, workspaceCalendar: true }, ...over });
const manifest = (...revisions) => ({ schema: 1, revisions });
const REAL = "https://staging-api.example-host.com"; // a non-mock API origin
const env = (extra = {}) => ({ VITE_BIZGENIE_API_URL: REAL, VITE_API_COMPAT_MODE: "enforce", ...extra });
const prod = { mode: "production" };

describe("the shipped manifest", () => {
  it("is empty today: no API revision is verified, so every gated feature is off in every release build", () => {
    expect(API_COMPATIBILITY.revisions).toHaveLength(0);
    for (const feature of Object.keys(FEATURES)) {
      const a = featureAvailability(feature, env({ [FEATURES[feature].flag]: "true", VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV }), prod);
      expect(a, feature).toMatchObject({ enabled: false, state: "revision_not_in_manifest" });
    }
  });
  it("every exported flag function is off with its flag true, a declared revision and the shipped manifest (enforced)", () => {
    const e = env({ VITE_GENERATION_QUOTE_API: "true", VITE_CUSTOMER_MEDIA_API: "true", VITE_WORKSPACE_CALENDAR_API: "true", VITE_UNSCHEDULE_API: "true", VITE_CUSTOMER_MEDIA_INTAKE_API: "true", VITE_CUSTOMER_MEDIA_DELETE_API: "true",
      VITE_SOCIAL_ACCOUNTS_API: "true", VITE_ANALYTICS_API: "true", VITE_PLAN_CATALOGUE_API: "true", VITE_CREDIT_PREVIEW_API: "true", VITE_BILLING_MANAGEMENT_API: "true", VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV });
    for (const fn of [isGenerationQuoteApiEnabled, isCustomerMediaApiEnabled, isWorkspaceCalendarApiEnabled, isUnscheduleApiEnabled, isMediaIntakeApiEnabled, isMediaDeleteApiEnabled, isSocialApiEnabled, isAnalyticsApiEnabled,
      isPlanCatalogueApiEnabled, isCreditPreviewApiEnabled, isBillingManagementApiEnabled]) expect(fn(e), fn.name).toBe(false);
  });
  it("every capability a feature needs is a known capability", () => { for (const f of Object.values(FEATURES)) expect(CAPABILITIES).toContain(f.capability); });
});

describe("gate decisions with an injected manifest", () => {
  const f = "generationQuote";
  const on = (extra = {}) => env({ VITE_GENERATION_QUOTE_API: "true", VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV, ...extra });
  it("flag off: off whatever the manifest says", () => expect(featureAvailability(f, env({ VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV }), { manifest: manifest(entry()), ...prod })).toMatchObject({ enabled: false, state: "flag_off" }));
  it("flag on, no revision declared: off (unverified)", () => expect(featureAvailability(f, env({ VITE_GENERATION_QUOTE_API: "true" }), { manifest: manifest(entry()), ...prod })).toMatchObject({ enabled: false, state: "api_revision_undeclared" }));
  it.each([[{ VITE_API_SOURCE_SHA: "not-a-sha", VITE_API_SERVING_REVISION: REV }], [{ VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: "  " }], [{ VITE_API_SOURCE_SHA: SHA.toUpperCase().slice(0, 39), VITE_API_SERVING_REVISION: REV }], [{ VITE_API_SOURCE_SHA: SHA }]])("malformed or half-declared revision %#: off", (extra) =>
    expect(featureAvailability(f, env({ VITE_GENERATION_QUOTE_API: "true", ...extra }), { manifest: manifest(entry()), ...prod })).toMatchObject({ enabled: false, state: "api_revision_malformed" }));
  it("mismatched WEB/API revision (right sha, wrong serving revision, or the reverse): off", () => {
    expect(featureAvailability(f, on({ VITE_API_SERVING_REVISION: "another-revision" }), { manifest: manifest(entry()), ...prod }).state).toBe("revision_not_in_manifest");
    expect(featureAvailability(f, on({ VITE_API_SOURCE_SHA: OTHER }), { manifest: manifest(entry()), ...prod }).state).toBe("revision_not_in_manifest");
  });
  it("revision listed but the capability is not verified for it: off", () => expect(featureAvailability("social", on({ VITE_SOCIAL_ACCOUNTS_API: "true" }), { manifest: manifest(entry()), ...prod })).toMatchObject({ enabled: false, state: "capability_not_verified" }));
  it("flag on + exact revision + verified capability: on", () => {
    expect(featureAvailability(f, on(), { manifest: manifest(entry()), ...prod })).toMatchObject({ enabled: true, state: "verified" });
    expect(featureAvailability("customerMedia", on({ VITE_CUSTOMER_MEDIA_API: "true" }), { manifest: manifest(entry()), ...prod }).enabled).toBe(true); // same capability
    expect(featureAvailability("workspaceCalendar", on({ VITE_WORKSPACE_CALENDAR_API: "true" }), { manifest: manifest(entry()), ...prod }).enabled).toBe(true);
  });
  it("a malformed manifest entry is ignored entirely, never partly trusted", () => {
    const bad = [entry({ sourceSha: "short" }), entry({ evidence: "http://example.test/x" }), entry({ evidence: "https://u:p@example.test/x" }), entry({ servingRevision: "" }), entry({ verifiedAt: "yesterday" }),
      entry({ capabilities: {} }), entry({ capabilities: { quotedGeneration: "yes" } }), entry({ capabilities: { invented: true } }), entry({ socialProviders: ["myspace"] }), null, 5];
    expect(validEntries(manifest(...bad)).good).toHaveLength(0);
    expect(featureAvailability(f, on(), { manifest: manifest(...bad), ...prod }).enabled).toBe(false);
    expect(validEntries({ schema: 2, revisions: [entry()] }).good).toHaveLength(0);
    expect(validEntries({ schema: 1, revisions: "x" }).good).toHaveLength(0);
    expect(validEntries(undefined).good).toHaveLength(0);
  });
  it("social providers are narrowed to those the verified revision supports", () => {
    const m = manifest(entry({ capabilities: { social: true }, socialProviders: ["tiktok"] }));
    const e = on({ VITE_SOCIAL_ACCOUNTS_API: "true" });
    expect(verifiedSocialProviders(e, { manifest: m, ...prod })).toEqual(["tiktok"]);
    expect(verifiedSocialProviders(on(), { manifest: manifest(), ...prod })).toEqual([]);
    expect(verifiedSocialProviders({ VITE_BIZGENIE_API_URL: "http://api.test" }, prod)).toBeNull(); // a test double: no narrowing
  });
});

describe("where the gate does not apply, and where it cannot be bypassed", () => {
  it("browser test doubles (.test, loopback) are exempt; real hosts are not", () => {
    for (const u of ["http://api.test", "http://localhost:8080", "http://127.0.0.1:4000", "https://x.example", "http://api.invalid"]) expect(isMockApiHost(u), u).toBe(true);
    for (const u of ["https://staging-api.getbizgenie.com", "https://example.com", "", undefined, "not a url", "https://notlocalhost.com"]) expect(isMockApiHost(u), String(u)).toBe(false);
    expect(featureAvailability("generationQuote", { VITE_GENERATION_QUOTE_API: "true", VITE_BIZGENIE_API_URL: "http://api.test" }, prod)).toMatchObject({ enabled: true, state: "not_applicable_mock_api" });
  });
  it("unit-test mode is lenient only until a test asks for enforcement", () => {
    expect(featureAvailability("generationQuote", { VITE_GENERATION_QUOTE_API: "true", VITE_BIZGENIE_API_URL: REAL }, { mode: "test" })).toMatchObject({ enabled: true, state: "not_applicable_test_mode" });
    expect(featureAvailability("generationQuote", { VITE_GENERATION_QUOTE_API: "true", VITE_BIZGENIE_API_URL: REAL, VITE_API_COMPAT_MODE: "enforce" }, { mode: "test" }).enabled).toBe(false);
  });
  it("in a release build no setting turns enforcement off (VITE_API_COMPAT_MODE is ignored outside test mode)", () => {
    for (const v of ["off", "false", "lenient", "test", "", undefined]) expect(featureAvailability("generationQuote", { VITE_GENERATION_QUOTE_API: "true", VITE_BIZGENIE_API_URL: REAL, VITE_API_COMPAT_MODE: v }, prod).enabled, String(v)).toBe(false);
  });
  it("the real offered-provider list is unchanged in tests and empty under enforcement with the shipped manifest", () => {
    expect(connectableProviders("tiktok,linkedin")).toEqual(["linkedin", "tiktok"]);
    vi.stubEnv("VITE_API_COMPAT_MODE", "enforce"); vi.stubEnv("VITE_BIZGENIE_API_URL", REAL);
    expect(connectableProviders("tiktok,linkedin")).toEqual([]);
    vi.unstubAllEnvs();
  });
});

describe("customer-visible effect", () => {
  it("plans/billing controls stay off when only the flags are set, and nothing is requested from the API", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ subscription: null, available_credits: 0 }) })); vi.stubGlobal("fetch", fetchSpy);
    render(<PremiumBilling session={{ status: "ready", accessToken: "t", tenantId: "t1" }} isOwner env={env({ VITE_PLAN_CATALOGUE_API: "true", VITE_BILLING_MANAGEMENT_API: "true", VITE_API_SOURCE_SHA: SHA, VITE_API_SERVING_REVISION: REV })} />);
    expect(await screen.findByText(/has not published plans, prices and terms/i)).toBeInTheDocument();
    expect(screen.getByText(/not available in BizGenie yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel subscription|change plan|choose/i })).toBeNull();
    expect(fetchSpy.mock.calls.some(([u]) => /\/customer\/billing\/(plans|management|invoices)/.test(String(u)))).toBe(false);
  });
});
