// BG-LAUNCH-CLOSURE-10: a social platform returns the browser to the Studio (Studio-hosted callback path or the legacy relay URL). The Studio must open the accounts view by itself,
// check the return against the attempt this browser started, send ONE completion request, clean the address bar and never log or echo the platform's code or state.
// All network is mocked with the backend's real request/response shapes. This is NOT a live OAuth handshake and NOT hosted acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();
vi.mock("../billingClient", async (importOriginal) => ({ ...(await importOriginal()), readCustomerBillingState: vi.fn().mockResolvedValue({ status: "not_subscribed", subscription: null }) }));
vi.mock("../session", () => ({ getCustomerSession: (...a) => getCustomerSessionMock(...a), refreshCustomerSession: vi.fn() }));
vi.mock("../authClient", () => ({ onAuthStateChange: vi.fn(() => () => {}), signOut: vi.fn(), signInWithPassword: vi.fn(), signUpWithPassword: vi.fn() }));

const SESSION = { status: "ready", accessToken: "token-a", tenantId: "tenant-a", projectId: "project-a", brandId: "brand-a" };
const ok = (body, status = 200) => ({ ok: true, status, headers: new Headers(), json: async () => body });
const STATE = "S".repeat(43), CODE = "AUTH_CODE_CANARY_0123456789", VERIFIER = "v".repeat(43);
const BRAIN = { brand_id: "brand-a", project_id: "project-a", name: "Northgate Vehicle Leasing", identity: { description: "We lease cars and vans to small businesses." }, audience: { summary: "Small business owners." }, commercial: { primary_cta: "Request a quote" }, metadata: { version: 1, status: "draft" } };
const ONBOARDING = { status: "ready", onboarding: { contract_version: "workspace-onboarding.v1", status: "completed", profile_version: 1, sector_key: "leasing", sector_source: "customer", industry_text: null, channels: ["email"], channels_source: "customer", current_step: null, draft: {}, completed_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }, brand_name_placeholder: false };
const CONNECTED = { connection_id: "c1", platform: "linkedin", account_id: "member_1", display_name: "A Member", status: "active", expires_at: "2027-01-01T00:00:00Z", version: 1 };
let calls = [], completeStatus = 200, logged = [], spies = [];
const pending = (o = {}) => sessionStorage.setItem("bizgenie.social.pending", JSON.stringify({ intentId: "11111111-1111-4111-8111-111111111111", state: STATE, verifier: VERIFIER, provider: "linkedin", redirectUri: "https://staging-app.getbizgenie.com/customer/social/oauth/callback/linkedin", expiresAt: new Date(Date.now() + 240000).toISOString(), scope: { tenantId: "tenant-a", projectId: "project-a", brandId: "brand-a" }, ...o }));
const at = (path) => window.history.replaceState(null, "", path);

beforeEach(() => {
  vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "true"); vi.stubEnv("VITE_SOCIAL_ACCOUNTS_API", "true");
  window.scrollTo = vi.fn(); sessionStorage.clear(); calls = []; completeStatus = 200; logged = [];
  spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m).mockImplementation((...a) => logged.push(a.map(String).join(" "))));
  getCustomerSessionMock.mockReset(); getCustomerSessionMock.mockResolvedValue(SESSION);
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase(), path = new URL(url).pathname; calls.push({ method, path, body: options.body ? JSON.parse(options.body) : null, url: String(url) });
    if (path === "/customer/workspace/brand-brain") return ok({ status: "ready", brand_brain: BRAIN });
    if (path === "/customer/workspace/onboarding") return ok(ONBOARDING);
    if (path === "/customer/workspace") { const w = { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", tenant_name: "T", project_name: "P", brand_name: "B", brand_status: "approved", membership_role: "owner" }; return ok({ status: "ready", workspace: w, workspaces: [w] }); }
    if (path === "/customer/campaigns") return ok({ campaigns: [] });
    if (path === "/customer/social/connections") return ok({ connections: method === "GET" ? [] : [], next_cursor: null });
    if (path === "/customer/social/dispatches") return ok({ dispatches: [], next_cursor: null });
    if (path === "/customer/social/oauth-complete") return completeStatus === 200 ? ok(CONNECTED) : { ok: false, status: completeStatus, headers: new Headers(), json: async () => ({ error: { code: completeStatus === 401 ? "AUTHENTICATION_REQUIRED" : "OAUTH_STATE_INVALID" } }) };
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); spies.forEach((s) => s.mockRestore()); at("/"); sessionStorage.clear(); });
const completions = () => calls.filter((c) => c.path === "/customer/social/oauth-complete");
const dump = () => { console.info; };
const leaked = () => logged.concat(document.body.textContent).join(" ");

describe("returning from a social platform lands in the accounts view and is handled once", () => {
  it("Studio-hosted callback path: opens Accounts and publishing by itself, sends ONE completion with the stored verifier, cleans the address bar, logs nothing", async () => {
    pending(); at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`);
    render(<App />);
    expect(await screen.findByText(/LinkedIn is connected/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /connected accounts and publishing/i })).toBeInTheDocument();
    expect(completions()).toHaveLength(1);
    expect(completions()[0].body).toMatchObject({ tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", intent_id: "11111111-1111-4111-8111-111111111111", state: STATE, code: CODE, code_verifier: VERIFIER });
    expect(window.location.pathname).toBe("/"); expect(window.location.search).toBe(""); expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull();
    expect(logged.join(" ")).not.toMatch(new RegExp(`${CODE}|${STATE}|${VERIFIER}`)); expect(document.body.textContent).not.toContain(CODE);
  });
  it("legacy relay URL (/?code&state) is handled the same way", async () => {
    pending(); at(`/?code=${CODE}&state=${STATE}`);
    render(<App />); expect(await screen.findByText(/LinkedIn is connected/)).toBeInTheDocument(); expect(completions()).toHaveLength(1);
  });
  it("a reload after the return (callback retry) sends nothing: the address bar is clean and the attempt is gone", async () => {
    pending(); at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`);
    const first = render(<App />); await screen.findByText(/LinkedIn is connected/); first.unmount(); cleanup();
    render(<App />); await waitFor(() => expect(screen.getByRole("navigation", { name: /workspace sections/i })).toBeInTheDocument()); expect(completions()).toHaveLength(1);
  });
  it("a replayed callback URL (attempt already used) is refused with a fixed message and nothing is sent", async () => {
    at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`); // no pending attempt in this browser
    render(<App />); expect(await screen.findByRole("alert")).toHaveTextContent(/not open any more/); expect(completions()).toHaveLength(0); expect(leaked()).not.toContain(CODE);
  });
});

describe("every unsafe or malformed return is refused before the backend is called", () => {
  const cases = [
    ["wrong provider in the path (cross-provider confusion)", () => { pending({ provider: "tiktok" }); return `/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`; }, /different platform/],
    ["unknown provider in the path", () => { pending(); return `/customer/social/oauth/callback/myspace?code=${CODE}&state=${STATE}`; }, /not one BizGenie connects to/],
    ["state that does not match the stored attempt", () => { pending(); return `/customer/social/oauth/callback/linkedin?code=${CODE}&state=${"Z".repeat(43)}`; }, /did not match this connection attempt/],
    ["missing state", () => { pending(); return `/customer/social/oauth/callback/linkedin?code=${CODE}`; }, /incomplete/],
    ["missing code", () => { pending(); return `/customer/social/oauth/callback/linkedin?state=${STATE}`; }, /incomplete/],
    ["malformed state (too short / bad characters)", () => { pending({ state: "short" }); return "/customer/social/oauth/callback/linkedin?code=abc&state=short"; }, /not in the expected form/],
    ["malformed code (space/control characters)", () => { pending(); return `/customer/social/oauth/callback/linkedin?code=${encodeURIComponent("a b\u0007")}&state=${STATE}`; }, /not in the expected form/],
    ["duplicated parameters", () => { pending(); return `/customer/social/oauth/callback/linkedin?code=${CODE}&code=other&state=${STATE}`; }, /not in the expected form/],
    ["expired attempt", () => { pending({ expiresAt: new Date(Date.now() - 1000).toISOString() }); return `/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`; }, /expired/],
    ["attempt started in another workspace (wrong tenant)", () => { pending({ scope: { tenantId: "tenant-b", projectId: "project-a", brandId: "brand-a" } }); return `/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`; }, /different workspace/],
    ["attempt started in another project", () => { pending({ scope: { tenantId: "tenant-a", projectId: "project-b", brandId: "brand-a" } }); return `/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`; }, /different workspace/],
    ["provider error callback (access_denied)", () => { pending(); return `/customer/social/oauth/callback/linkedin?error=access_denied&error_description=${encodeURIComponent("<img src=x onerror=alert(1)>")}&state=${STATE}`; }, /Permission was not given/],
  ];
  for (const [name, setup, message] of cases) it(name, async () => {
    const url = setup(); at(url);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(completions()).toHaveLength(0); expect(logged.join(" ")).not.toMatch(/Not implemented: navigation/); // an open redirect would navigate (jsdom reports it); the Studio never navigates from the query
    expect(window.location.search).toBe(""); expect(window.location.pathname).toBe("/"); expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull();
    expect(leaked()).not.toContain(CODE); expect(document.body.innerHTML).not.toMatch(/onerror|<img/);
  });
  it("a redirect-looking parameter in the return is ignored (no navigation, nothing sent)", async () => {
    pending({ provider: "tiktok" }); at(`/?code=${CODE}&state=${STATE}&redirect=https://evil.example&next=//evil.example&return_to=javascript:alert(1)`);
    render(<App />);
    await screen.findByRole("heading", { name: /connected accounts and publishing/i }); await new Promise((r) => setTimeout(r, 30)); expect(logged.join(" ")).not.toMatch(/Not implemented: navigation/); expect(completions()).toHaveLength(1);
  });
});

describe("failure and gating behaviour", () => {
  it("backend authentication failure (401) is reported with a fixed message; nothing from the return is shown or logged", async () => {
    completeStatus = 401; pending(); at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`);
    render(<App />); await waitFor(() => expect(completions()).toHaveLength(1)); await waitFor(() => expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull());
    expect(leaked()).not.toMatch(new RegExp(`${CODE}|${VERIFIER}`)); expect(window.location.search).toBe("");
  });
  it("backend refusal (stale state) is reported and the attempt is not retried automatically", async () => {
    completeStatus = 409; pending(); at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`);
    render(<App />); await waitFor(() => expect(completions()).toHaveLength(1)); await new Promise((r) => setTimeout(r, 50)); expect(completions()).toHaveLength(1);
  });
  it("integration switched OFF: a stray platform return sends nothing, is removed from the address bar and clears the stored attempt", async () => {
    vi.stubEnv("VITE_SOCIAL_ACCOUNTS_API", "false"); pending(); at(`/customer/social/oauth/callback/linkedin?code=${CODE}&state=${STATE}`);
    render(<App />); expect(await screen.findByText(/not switched on in BizGenie yet/)).toBeInTheDocument();
    expect(completions()).toHaveLength(0); expect(window.location.search).toBe(""); expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull();
  });
});
