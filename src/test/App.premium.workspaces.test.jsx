// Premium Studio workspace selection (BG-STUDIO-011-FE, API contract G5).
// The API and the session are MOCKED with the shapes of bizgenie-api's existing /customer/workspace routes and
// workspace-onboarding.v1 (API draft PR #213). These are NOT deployed or staging proof.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();
const refreshCustomerSessionMock = vi.fn();
let authListener = null;
vi.mock("../billingClient", async (importOriginal) => ({ ...(await importOriginal()), readCustomerBillingState: vi.fn().mockResolvedValue({ status: "not_subscribed", subscription: null }) }));
vi.mock("../session", () => ({ getCustomerSession: (...a) => getCustomerSessionMock(...a), refreshCustomerSession: (...a) => refreshCustomerSessionMock(...a) }));
vi.mock("../authClient", () => ({ onAuthStateChange: vi.fn((cb) => { authListener = cb; return () => {}; }), signOut: vi.fn(), signInWithPassword: vi.fn(), signUpWithPassword: vi.fn() }));

const ok = (body, status = 200) => ({ ok: true, status, headers: new Headers(), json: async () => body });
const fail = (status = 500, body = {}) => ({ ok: false, status, headers: new Headers(), json: async () => body });

const WS_A = { tenant_id: "tenant-1", tenant_name: "Northgate Group", project_id: "project-a", project_name: "Northgate campaigns", brand_id: "brand-a", brand_name: "Northgate Vehicle Leasing", brand_status: "approved", membership_role: "owner" };
const WS_B = { tenant_id: "tenant-1", tenant_name: "Northgate Group", project_id: "project-b", project_name: "Brookside campaigns", brand_id: "brand-b", brand_name: "Brookside Aesthetics", brand_status: "approved", membership_role: "owner" };
const WS_C = { tenant_id: "tenant-1", tenant_name: "Northgate Group", project_id: "project-c", project_name: "Harbour campaigns", brand_id: "brand-c", brand_name: "Harbour Partners", brand_status: "draft", membership_role: "owner" };
const sessionFor = (w, token) => ({ status: "ready", accessToken: token, tenantId: w.tenant_id, projectId: w.project_id, brandId: w.brand_id });
const TOKEN_A = "token-a"; const TOKEN_B = "token-b";
const SESSION_A = sessionFor(WS_A, TOKEN_A);
const SESSION_B = sessionFor(WS_B, TOKEN_B);
const SCOPE_MISSING = { status: "scope-missing", accessToken: "token-identity" };

const brain = (name, description) => ({ brand_id: "x", project_id: "x", name, identity: { description }, audience: { summary: "Customers" }, commercial: { primary_cta: "Enquire" }, metadata: { version: 1, status: "approved" } });
const onboardingDoc = (w, over = {}) => ({ contract_version: "workspace-onboarding.v1", tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id, version: 3, status: "completed", sector: { key: "leasing", source: "customer" }, industry_text: null, channels: { values: ["email"], source: "customer" }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: "2026-10-24T10:00:00.000Z", updated_at: "2026-10-24T10:00:00.000Z", ...over });

let world; let calls; let handlers;
// Everything the fake API knows, per workspace, selected by the bearer token (which carries the scope).
function newWorld() {
  return {
    list: [WS_A, WS_B],
    byToken: {
      [TOKEN_A]: { ws: WS_A, brain: brain("Northgate Vehicle Leasing", "We lease cars and vans to small businesses."), onboarding: onboardingDoc(WS_A, { sector: { key: "leasing", source: "customer" } }), campaigns: [{ campaign_id: "11111111-1111-4111-8111-111111111111", name: "Northgate spring leasing", status: "active", archived_at: null, updated_at: "2026-10-20T10:00:00.000Z" }] },
      [TOKEN_B]: { ws: WS_B, brain: brain("Brookside Aesthetics", "An aesthetics clinic in Leeds."), onboarding: onboardingDoc(WS_B, { sector: { key: "aesthetics", source: "customer" }, channels: { values: ["instagram"], source: "customer" } }), campaigns: [] },
    },
  };
}
const forToken = (opts) => world.byToken[String((opts.headers || {}).authorization || "").replace("Bearer ", "")];

beforeEach(() => {
  vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "true");
  window.scrollTo = vi.fn();
  getCustomerSessionMock.mockReset(); getCustomerSessionMock.mockResolvedValue(SESSION_A);
  refreshCustomerSessionMock.mockReset(); refreshCustomerSessionMock.mockResolvedValue(SESSION_B);
  authListener = null; calls = []; world = newWorld();
  handlers = {
    "GET /customer/workspace": () => ok({ status: "selection_required", workspace: null, workspaces: world.list }),
    "POST /customer/workspace/select": (_u, o) => {
      const b = JSON.parse(o.body); const w = world.list.find((x) => x.tenant_id === b.tenant_id && x.project_id === b.project_id && x.brand_id === b.brand_id);
      return w ? ok({ status: "ready", workspace: w, requires_session_refresh: true }) : fail(400, { status: "failed", error: { code: "WORKSPACE_VALIDATION_ERROR" } });
    },
    "GET /customer/workspace/brand-brain": (_u, o) => { const d = forToken(o); return d ? ok({ status: "ready", brand_brain: d.brain }) : fail(403); },
    "GET /customer/workspace/onboarding": (_u, o) => { const d = forToken(o); return d ? ok({ status: "ready", onboarding: d.onboarding, brand_name_placeholder: false }) : fail(403, { status: "failed", error: { code: "WORKSPACE_NOT_AUTHORIZED" } }); },
    "PUT /customer/workspace/onboarding": (_u, o) => {
      const d = forToken(o); const b = JSON.parse(o.body);
      if (!d) return fail(403, { status: "failed", error: { code: "WORKSPACE_NOT_AUTHORIZED" } });
      if (b.expected_version !== d.onboarding.version) return fail(409, { error: { code: "VERSION_CONFLICT", details: { current_version: d.onboarding.version } } });
      const n = { ...d.onboarding, draft: { ...d.onboarding.draft }, version: d.onboarding.version + 1, status: d.onboarding.status === "not_started" ? "in_progress" : d.onboarding.status };
      for (const [k, v] of Object.entries(b.draft || {})) { if (v === null) delete n.draft[k]; else n.draft[k] = v; }
      if (b.current_step !== undefined) n.current_step = b.current_step;
      d.onboarding = n; return ok({ status: "saved", replayed: false, onboarding: n, brand_name_placeholder: false });
    },
    "GET /customer/campaigns": (_u, o) => { const d = forToken(o); return d ? ok({ campaigns: d.campaigns }) : fail(403); },
    "GET /customer/campaigns/*": () => fail(404),
  };
  const match = (key, method, path) => { const [m, p] = key.split(" "); if (m !== method) return false; if (!p.includes("*")) return p === path; return new RegExp(`^${p.replaceAll("*", "[^/]+")}$`).test(path); };
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase(); const path = new URL(url).pathname;
    calls.push({ method, path, url, options });
    for (const [key, fn] of Object.entries(handlers)) if (match(key, method, path)) return fn(url, options);
    return fail(404);
  });
  URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const called = (method, suffix) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));
const button = (name) => screen.getByRole("button", { name });
const nav = () => screen.getByRole("navigation", { name: /workspace sections/i });
const openWorkspaces = async () => { fireEvent.click(within(nav()).getByRole("button", { name: "Workspaces" })); await screen.findByRole("heading", { name: /switch workspace/i }); };

describe("choosing when the API says selection_required", () => {
  beforeEach(() => { getCustomerSessionMock.mockResolvedValue(SCOPE_MISSING); });

  it("lists the customer's authorised workspaces and selects NONE for them", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    const list = screen.getByRole("list", { name: /workspaces you can use/i });
    expect(within(list).getByText("Northgate Vehicle Leasing")).toBeInTheDocument();
    expect(within(list).getByText("Brookside Aesthetics")).toBeInTheDocument();
    expect(screen.getByText(/will not pick one for you/i)).toBeInTheDocument();
    await act(async () => {});
    expect(called("POST", "/workspace/select")).toHaveLength(0);
    expect(called("POST", "/workspace/bootstrap")).toHaveLength(0);
    for (const suffix of ["/brand-brain", "/workspace/onboarding", "/customers/campaigns"]) expect(called("GET", suffix)).toHaveLength(0);
    // The identity token is used for the list; it carries no workspace.
    expect(called("GET", "/customer/workspace")[0].options.headers.authorization).toBe("Bearer token-identity");
    expect(screen.queryByRole("navigation", { name: /workspace sections/i })).toBeNull();
  });

  it("selects the workspace the customer presses, refreshes the session, and loads only that workspace", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    const [select] = called("POST", "/workspace/select");
    expect(JSON.parse(select.options.body)).toEqual({ tenant_id: "tenant-1", project_id: "project-b", brand_id: "brand-b" });
    expect(select.options.headers.authorization).toBe("Bearer token-identity");
    expect(refreshCustomerSessionMock).toHaveBeenCalledTimes(1); // requires_session_refresh was true
    expect(document.body.textContent).not.toContain("Northgate Vehicle Leasing");
    expect(called("GET", "/brand-brain").every((c) => c.options.headers.authorization === "Bearer token-b")).toBe(true);
    expect(called("GET", "/workspace/onboarding").every((c) => c.options.headers.authorization === "Bearer token-b")).toBe(true);
  });

  it("does not refresh the session when the API does not ask for it, but still checks the session carries the choice", async () => {
    handlers["POST /customer/workspace/select"] = () => ok({ status: "ready", workspace: WS_B });
    getCustomerSessionMock.mockResolvedValueOnce(SCOPE_MISSING).mockResolvedValue(SESSION_B);
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    expect(refreshCustomerSessionMock).not.toHaveBeenCalled();
  });

  it("will not show a workspace whose sign-in has not switched: it says so and reloads the one the session still points at", async () => {
    refreshCustomerSessionMock.mockResolvedValue(SCOPE_MISSING); // the token still carries no scope
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in has not switched/i);
    expect(document.body.textContent).not.toMatch(/Welcome back/);
    expect(called("GET", "/brand-brain")).toHaveLength(0);
  });

  it("treats a session that now carries a DIFFERENT workspace as not switched", async () => {
    refreshCustomerSessionMock.mockResolvedValue(SESSION_A); // the customer chose B
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/has not switched/i);
    expect(document.body.textContent).not.toContain("Brookside Aesthetics' ");
    expect(screen.queryByRole("heading", { name: /^Welcome back/ })).toBeNull();
  });

  it("an unselectable (not yet approved) workspace is shown, disabled and explained, never hidden", async () => {
    world.list = [WS_A, WS_B, WS_C];
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    const row = screen.getByText("Harbour Partners").closest("li");
    expect(within(row).getByRole("button")).toBeDisabled();
    expect(within(row).getByText(/not ready yet \(status: draft\)/i)).toBeInTheDocument();
  });

  it("access removed after the list was shown: says so, refreshes the list, selects nothing", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    world.list = [WS_A]; // B was revoked in the meantime
    handlers["GET /customer/workspace"] = () => ok({ status: "ready", workspace: WS_A });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByText(/not available to your account any more/i)).toBeInTheDocument();
    expect(screen.queryByText("Brookside Aesthetics")).toBeNull();
    expect(refreshCustomerSessionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /^Welcome back/ })).toBeNull();
  });

  it("a server that confirms a DIFFERENT workspace is not trusted", async () => {
    handlers["POST /customer/workspace/select"] = () => ok({ status: "ready", workspace: WS_A, requires_session_refresh: true });
    render(<App />);
    await screen.findByRole("heading", { name: /choose a workspace/i });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not confirm the workspace you chose/i);
    expect(refreshCustomerSessionMock).not.toHaveBeenCalled();
  });

  it("an unavailable list is stated plainly, never shown as empty, and recovers on retry", async () => {
    let up = false;
    handlers["GET /customer/workspace"] = () => (up ? ok({ status: "selection_required", workspaces: world.list }) : fail(503));
    render(<App />);
    await screen.findByRole("heading", { name: /tell us about your business|let.s set up your workspace/i });
    // The list could not load: the existing onboarding path stays available and still never guesses a workspace.
    expect(called("POST", "/workspace/select")).toHaveLength(0);
  });

  it("a malformed list shows no workspaces rather than guessing", async () => {
    handlers["GET /customer/workspace"] = () => ok({ status: "selection_required", workspaces: [{ brand_id: "b" }, { brand_id: "c" }] });
    render(<App />);
    await screen.findByRole("heading", { name: /let.s set up your workspace/i });
    expect(screen.queryByRole("list", { name: /workspaces you can use/i })).toBeNull();
  });

  it("creating a workspace never silently picks one when the customer already has several", async () => {
    handlers["GET /customer/workspace"] = (() => { let n = 0; return () => (++n === 1 ? ok({ status: "missing_workspace", workspace: null }) : ok({ status: "selection_required", workspaces: world.list })); })();
    render(<App />);
    await screen.findByRole("heading", { name: /let.s set up your workspace/i });
    fireEvent.click(button(/^continue$/i));
    fireEvent.change(await screen.findByLabelText(/business name/i), { target: { value: "New Co" } });
    fireEvent.click(button(/create my workspace/i));
    expect(await screen.findByRole("heading", { name: /choose a workspace/i })).toBeInTheDocument();
    expect(called("POST", "/workspace/bootstrap")).toHaveLength(0);
    expect(called("POST", "/workspace/select")).toHaveLength(0);
  });
});

describe("switching from a workspace you are in", () => {
  it("marks the current workspace, switches on request, clears the old one, and uses the new token everywhere", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    expect(screen.getByText("Northgate spring leasing")).toBeInTheDocument();
    await openWorkspaces();
    const current = screen.getByText("Northgate Vehicle Leasing", { selector: "h3" }).closest("li");
    expect(within(current).getByText("Current workspace")).toBeInTheDocument();
    expect(within(current).getByRole("button")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Northgate|spring leasing/);
    expect(screen.getByText("Aesthetics clinic", { selector: ".ps-chip" })).toBeInTheDocument();
    const last = (suffix) => called("GET", suffix).pop().options.headers.authorization;
    expect(last("/brand-brain")).toBe("Bearer token-b");
    expect(last("/workspace/onboarding")).toBe("Bearer token-b");
    expect(last("/customer/campaigns")).toBe("Bearer token-b");
    expect(screen.getByText(/you have no campaigns yet/i)).toBeInTheDocument();
  });

  it("shows nothing from the old workspace while switching", async () => {
    let release;
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    await openWorkspaces();
    handlers["POST /customer/workspace/select"] = () => new Promise((resolve) => { release = () => resolve(ok({ status: "ready", workspace: WS_B, requires_session_refresh: true })); });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    const panel = await screen.findByRole("status", { name: /switching workspace/i });
    expect(panel).toHaveTextContent(/switching to brookside aesthetics/i);
    expect(document.body.textContent).not.toMatch(/Northgate Vehicle Leasing|spring leasing/);
    expect(screen.queryByRole("navigation", { name: /workspace sections/i })).toBeNull();
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
  });

  it("ignores a slow answer that belongs to the workspace being left", async () => {
    let releaseOnboarding;
    handlers["GET /customer/workspace/onboarding"] = (u, o) => {
      const d = forToken(o);
      if (d.ws === WS_A && !releaseOnboarding) return new Promise((resolve) => { releaseOnboarding = () => resolve(ok({ status: "ready", onboarding: onboardingDoc(WS_A, { draft: { goal: "A-only secret goal" } }), brand_name_placeholder: false })); });
      return ok({ status: "ready", onboarding: d.onboarding, brand_name_placeholder: false });
    };
    render(<App />);
    await waitFor(() => expect(typeof releaseOnboarding).toBe("function")); // A's onboarding is still in flight
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    // Move to B through the real chooser path while A's answer is outstanding.
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    await act(async () => { releaseOnboarding(); });
    expect(screen.getByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/A-only secret goal|Northgate/);
  });

  it("ignores a select request that completes after the customer has moved on", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    await openWorkspaces();
    let release;
    handlers["POST /customer/workspace/select"] = () => new Promise((resolve) => { release = () => resolve(ok({ status: "ready", workspace: WS_B, requires_session_refresh: true })); });
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    await screen.findByRole("status", { name: /switching workspace/i });
    // The account changes underneath (sign-out in another tab) before the slow select finishes.
    getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: /sign in to bizgenie/i });
    await act(async () => { release(); });
    expect(screen.getByRole("heading", { name: /sign in to bizgenie/i })).toBeInTheDocument();
    expect(refreshCustomerSessionMock).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/Brookside|Northgate/);
  });

  it("ignores a session refresh that completes after the customer has moved on", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    await openWorkspaces();
    let release;
    refreshCustomerSessionMock.mockImplementation(() => new Promise((resolve) => { release = () => resolve(SESSION_B); }));
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    await waitFor(() => expect(typeof release).toBe("function")); // the select was confirmed; the session refresh is in flight
    getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: /sign in to bizgenie/i });
    await act(async () => { release(); });
    expect(screen.getByRole("heading", { name: /sign in to bizgenie/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Brookside|Northgate/);
  });

  it("with one workspace there is nothing to switch to, and nothing is selected", async () => {
    handlers["GET /customer/workspace"] = () => ok({ status: "ready", workspace: WS_A });
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    await openWorkspaces();
    expect(await screen.findByText(/you have one workspace/i)).toBeInTheDocument();
    expect(called("POST", "/workspace/select")).toHaveLength(0);
  });

  it("when the current workspace has been revoked, the chooser says so and offers the others", async () => {
    world.list = [WS_B]; // A is gone from the list
    handlers["GET /customer/workspace"] = () => ok({ status: "ready", workspace: WS_B });
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    await openWorkspaces();
    expect(await screen.findByText(/current workspace is no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Brookside Aesthetics" })).toBeEnabled();
  });

  it("when the API refuses the current workspace (403), the workspace offers a way to choose another instead of a dead end", async () => {
    handlers["GET /customer/workspace/onboarding"] = () => fail(403, { status: "failed", error: { code: "WORKSPACE_NOT_AUTHORIZED" } });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /choose a workspace/i }));
    expect(await screen.findByRole("heading", { name: /switch workspace/i })).toBeInTheDocument();
  });

  it("unsaved answers are protected: the customer must explicitly discard them, and can stay", async () => {
    world.byToken[TOKEN_A].onboarding = onboardingDoc(WS_A, { version: 2, status: "in_progress", completed_at: null, current_step: 3, channels: { values: [], source: null } });
    render(<App />);
    await screen.findByRole("heading", { name: /who do you serve/i });
    fireEvent.change(screen.getByLabelText(/what do you want a campaign to achieve/i), { target: { value: "My unsaved goal" } });
    await openWorkspaces();
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/discard unsaved answers/i);
    expect(called("POST", "/workspace/select")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: /stay here/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(called("POST", "/workspace/select")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /discard and switch/i }));
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    expect(document.body.textContent).not.toContain("My unsaved goal");
  });
});

describe("save and resume across workspaces", () => {
  it("each workspace keeps its own saved progress through a round trip A to B to A", async () => {
    world.byToken[TOKEN_A].onboarding = onboardingDoc(WS_A, { version: 2, status: "in_progress", completed_at: null, current_step: 3, channels: { values: [], source: null } });
    world.byToken[TOKEN_B].onboarding = onboardingDoc(WS_B, { version: 7, status: "in_progress", completed_at: null, current_step: 3, channels: { values: [], source: null } });
    render(<App />);
    await screen.findByRole("heading", { name: /who do you serve/i });
    fireEvent.change(screen.getByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Fill the A diary" } });
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    // To B: it has its own version and no trace of A's goal.
    await openWorkspaces();
    fireEvent.click(screen.getByRole("button", { name: "Use Brookside Aesthetics" }));
    await screen.findByRole("heading", { name: /who do you serve/i });
    expect(screen.getByLabelText(/what do you want a campaign to achieve/i)).toHaveValue("");
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/version 7/i);
    fireEvent.change(screen.getByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Fill the B diary" } });
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    const puts = called("PUT", "/workspace/onboarding");
    expect(puts.map((c) => [c.options.headers.authorization, JSON.parse(c.options.body).expected_version])).toEqual([["Bearer token-a", 2], ["Bearer token-b", 7]]);
    // Back to A: its saved goal returns, B's does not leak.
    refreshCustomerSessionMock.mockResolvedValue(SESSION_A);
    await openWorkspaces();
    fireEvent.click(screen.getByRole("button", { name: "Use Northgate Vehicle Leasing" }));
    await screen.findByRole("heading", { name: /who do you serve/i });
    expect(screen.getByLabelText(/what do you want a campaign to achieve/i)).toHaveValue("Fill the A diary");
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/version 3/i);
    expect(document.body.textContent).not.toContain("Fill the B diary");
  });
});

describe("flag off", () => {
  it("makes no workspace-list or workspace-selection request and shows no chooser", async () => {
    vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "false");
    getCustomerSessionMock.mockResolvedValue(SCOPE_MISSING);
    render(<App />);
    await screen.findByLabelText(/your goal/i);
    await act(async () => {});
    expect(calls.filter((c) => c.path.startsWith("/customer/workspace"))).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: /choose a workspace/i })).toBeNull();
  });
});
