// Premium Studio in the production application (BG-STUDIO-008-FE).
// All network is mocked with the backend's real request/response shapes. These are NOT deployed or staging proof.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();
const refreshCustomerSessionMock = vi.fn();
let authListener = null;

vi.mock("../billingClient", async (importOriginal) => ({ ...(await importOriginal()), readCustomerBillingState: vi.fn().mockResolvedValue({ status: "not_subscribed", subscription: null }) }));
vi.mock("../session", () => ({
  getCustomerSession: (...args) => getCustomerSessionMock(...args),
  refreshCustomerSession: (...args) => refreshCustomerSessionMock(...args),
}));
vi.mock("../authClient", () => ({
  onAuthStateChange: vi.fn((callback) => { authListener = callback; return () => {}; }),
  signOut: vi.fn(), signInWithPassword: vi.fn(), signUpWithPassword: vi.fn(),
}));

const sessionFor = (n) => ({ status: "ready", accessToken: `token-${n}`, tenantId: `tenant-${n}`, projectId: `project-${n}`, brandId: `brand-${n}` });
const SESSION_A = sessionFor("a");
const SESSION_B = sessionFor("b");
const SCOPE_MISSING = { status: "scope-missing", accessToken: "token-new" };

const brainFor = (name, description = "", extra = {}) => ({
  brand_id: "brand-a", project_id: "project-a", name,
  ...(description ? { identity: { description } } : {}),
  metadata: { version: 1, status: "draft" }, ...extra,
});
const NORTHGATE = brainFor("Northgate Vehicle Leasing", "We lease cars and vans to small businesses.", { audience: { summary: "Small business owners." }, commercial: { primary_cta: "Request a quote" } });

const ok = (body, status = 200) => ({ ok: true, status, headers: new Headers(), json: async () => body });
const fail = (status = 500, body = {}) => ({ ok: false, status, headers: new Headers(), json: async () => body });
const CID = "22222222-2222-4222-8222-222222222222";
const REC = {
  recommendation_id: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a",
  campaign_name: "Lease Enquiry Campaign", summary: "Start with one clear offer.", explanation: "Recommended because it is the first safe campaign shape.",
  create_campaign_payload: { tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", name: "Lease Enquiry Campaign", goal: "Get more lease enquiries", display_timezone: "Europe/London" },
  suggested_items: [{ name: "Offer announcement", format: "text", platform: "instagram", placement: "feed", destination_label: "Instagram", reason: "Start with the offer." }],
};
const campaignDoc = (version, items, workflow = "draft", content) => ({
  campaign_id: CID, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", name: "Lease Enquiry Campaign", goal: "g", display_timezone: "Europe/London", version,
  items: REC.suggested_items.slice(0, items).map((item, i) => ({ content_item_id: `33333333-3333-4333-8333-33333333333${i}`, name: item.name, format: item.format,
    variants: [{ variant_id: `44444444-4444-4444-8444-44444444444${i}`, destination_label: item.destination_label, workflow, ...(workflow !== "draft" ? { current_revision_id: "revision-1", current_content: content || "Server persisted review copy" } : {}) }] })),
});

// BG-STUDIO-010-FE: the saved onboarding record, as the API (workspace-onboarding.v1) returns it. MOCKED, not staging.
const onboardingDoc = (over = {}) => ({
  contract_version: "workspace-onboarding.v1", tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a",
  version: 3, status: "completed", sector: { key: "leasing", source: "customer" }, industry_text: "vehicle leasing",
  channels: { values: ["email"], source: "customer" }, current_step: 6, draft: {},
  completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: "2026-10-23T10:00:00.000Z", updated_at: "2026-10-23T10:00:00.000Z", ...over,
});
const NOT_STARTED = onboardingDoc({ version: 0, status: "not_started", sector: { key: null, source: null }, industry_text: null, channels: { values: [], source: null }, current_step: null, completeness: { sector: false, channels: false, ready_to_complete: false, missing: ["sector_key", "channels"] }, completed_at: null, updated_at: null });
const onboardingResponse = (doc, extra = {}) => ok({ status: "ready", onboarding: doc, brand_name_placeholder: false, ...extra });

let handlers;
let calls;
beforeEach(() => {
  vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "true");
  window.scrollTo = vi.fn();
  getCustomerSessionMock.mockReset(); getCustomerSessionMock.mockResolvedValue(SESSION_A);
  refreshCustomerSessionMock.mockReset();
  authListener = null;
  calls = [];
  let itemCount = 0;
  handlers = {
    "GET /customer/workspace/brand-brain": () => ok({ status: "ready", brand_brain: NORTHGATE }),
    "GET /customer/workspace/onboarding": () => onboardingResponse(onboardingDoc()),
    "PUT /customer/workspace/brand-brain": (_u, o) => ok({ status: "ready", brand_brain: { ...JSON.parse(o.body), brand_id: "brand-a", project_id: "project-a", metadata: { version: 2, status: "draft" } } }),
    "GET /customer/workspace": () => ok({ status: "missing_workspace", workspace: null }),
    "GET /customer/campaigns": () => ok({ campaigns: [] }),
    "POST /customer/workspace/bootstrap": () => ok({ status: "ready", workspace: { tenant_id: "tenant-a" }, requires_session_refresh: false }, 201),
    "POST /customer/campaign-recommendations": () => ok({ recommendation: REC }),
    "POST /customer/campaigns": () => { itemCount = 0; return ok({ result: { campaign_id: CID, campaign_version: 1 }, campaign: campaignDoc(1, 0) }); },
    [`POST /customer/campaigns/${CID}/content-items`]: () => { itemCount += 1; return ok({ result: { campaign_id: CID }, campaign: campaignDoc(itemCount + 1, itemCount) }); },
    "GET /customer/campaigns/*/variants/*/creative-preview": (u) => {
      const q = new URL(u); const parts = q.pathname.split("/");
      return ok({ preview: { contract_version: "campaign-creative-preview.v1", campaign_id: parts[3], campaign_version: Number(q.searchParams.get("expected_campaign_version")), content_item_id: "33333333-3333-4333-8333-333333333330", variant_id: parts[5], revision_id: q.searchParams.get("revision_id"), revision_number: 1, platform: "instagram", placement: "feed", content_type: "text", workflow: "review", content_status: "available", copy_status: "available", copy: { title: null, body: "Server persisted review copy", caption: null, alt_text: null }, media: [], provenance: { source: "persisted_revision", revision_source: "manual", created_at: "2026-10-22T09:00:00.000Z" }, approval_status: "not_approved", platform_preview: { status: "unrendered", artifact_url: null, reason: "NO_PERSISTED_PLATFORM_ARTIFACT" }, acknowledgement_status: "not_acknowledged", read_only: true } });
    },
    "POST /customer/campaigns/*/variants/*/generate": () => ok({ campaign: campaignDoc(4, 1, "review") }),
    "POST /customer/campaigns/*/variants/*/preview-renders": () => ok({ preview: { render_receipt_id: "receipt-1", revision_id: "revision-1", platform: "instagram" } }, 201),
    "POST /customer/campaigns/*/variants/*/preview-acknowledgements": () => ok({ campaign: campaignDoc(5, 1, "review"), result: { created_ids: { preview_ids: ["preview-1"] } } }),
    "POST /customer/campaigns/*/variants/*/approval": () => ok({ campaign: campaignDoc(6, 1, "approved") }),
  };
  const match = (key, method, path) => { const [m, p] = key.split(" "); if (m !== method) return false; if (!p.includes("*")) return p === path; return new RegExp(`^${p.replaceAll("*", "[^/]+")}$`).test(path); };
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const path = new URL(url).pathname;
    calls.push({ method, path, url, options });
    for (const [key, fn] of Object.entries(handlers)) if (match(key, method, path)) return fn(url, options);
    return fail(404);
  });
  URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

const called = (method, suffix) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));
const button = (name) => screen.getByRole("button", { name });

describe("Premium Studio flag", () => {
  it("flag OFF: the current customer experience is unchanged and no premium UI or Brand Brain request appears", async () => {
    vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "false");
    render(<App />);
    expect(await screen.findByRole("heading", { name: /what do you want your campaign to achieve/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/your goal/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /workspace sections/i })).toBeNull();
    expect(screen.getByRole("region", { name: /brand brain/i })).toBeInTheDocument();
    await act(async () => {});
    expect(called("GET", "/brand-brain")).toHaveLength(0);
  });

  it("flag UNSET behaves as OFF", async () => {
    vi.unstubAllEnvs();
    render(<App />);
    expect(await screen.findByLabelText(/your goal/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /workspace sections/i })).toBeNull();
  });

  it("flag ON: the integrated workspace replaces the goal-first page for an authenticated customer", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." })).toBeInTheDocument();
    expect(screen.queryByLabelText(/your goal/i)).toBeNull();
    expect(screen.getByRole("navigation", { name: /workspace sections/i })).toBeInTheDocument();
  });
});

describe("authenticated entry", () => {
  it("shows sign-in for a signed-out visitor and requests no customer data", async () => {
    getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /sign in to bizgenie/i })).toBeInTheDocument();
    await act(async () => {});
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole("navigation", { name: /workspace sections/i })).toBeNull();
  });

  it("loads the Brand Brain with the customer's bearer token only", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /welcome back/i });
    const [request] = called("GET", "/brand-brain");
    expect(request.options.headers.authorization).toBe("Bearer token-a");
    expect(called("GET", "/brand-brain")).toHaveLength(1);
  });
});

describe("workspace content is real and labelled", () => {
  it("shows the customer's own brand, their saved sector, and saved facts with their source", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    expect(screen.getByText("Vehicle leasing", { selector: ".ps-chip" })).toBeInTheDocument();
    expect(screen.getByText(/saved · you chose this/i, { selector: ".ps-chip-note" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/inferred from what you typed/i);
    const facts = screen.getByRole("heading", { name: /what bizgenie knows/i }).closest("section");
    expect(within(facts).getByText("We lease cars and vans to small businesses.")).toBeInTheDocument();
    expect(within(facts).getAllByText("Saved").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/no measured results are recorded yet/i)).toBeInTheDocument();
  });

  it("never invents metrics, posts, results or another brand", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /welcome back/i });
    const text = document.body.textContent;
    for (const term of [/fonzo/i, /maison/i, /clearskin/i, /\b\d+(\.\d)?[KkMm]\b/, /illustrative/i, /simulated/i]) expect(text).not.toMatch(term);
    expect(screen.getByText(/manual only/i)).toBeInTheDocument();
  });

  it("uses neutral wording when the Brand Brain has no real name", async () => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Customer Campaign Workspace", "A description.") });
    // The BACKEND says this name is a placeholder; the browser holds no list of placeholder names.
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(onboardingDoc(), { brand_name_placeholder: true });
    render(<App />);
    // A placeholder name is not a real business name, so the profile is incomplete and onboarding opens, empty.
    await screen.findByRole("heading", { name: /tell us about your business/i });
    expect(screen.getByLabelText(/business name/i)).toHaveValue("");
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    await screen.findByRole("heading", { name: "Welcome to your workspace." });
    expect(document.body.textContent).not.toContain("Customer Campaign Workspace");
  });

  it.each([
    ["Maison Aurelle", "A fragrance house.", "Fragrance & perfume", ["lease", "clinic", "flavour"], "perfume"],
    ["Clearskin Studio", "An aesthetics clinic in Leeds.", "Aesthetics clinic", ["lease", "fragrance", "flavour"], "aesthetics"],
    ["Fonzo", "Soft drinks for everyone.", "Soft drinks & beverages", ["lease", "fragrance", "clinic"], "beverage"],
    ["WOW Charity", "We support local families.", "Charity & community", ["lease", "fragrance", "flavour"], "charity"],
    ["Harbour Partners", "Business consulting.", "Professional services", ["lease", "fragrance", "flavour", "clinic", "donate"], null],
    ["Brightside Window Cleaning", "Window cleaning for homes and shops across Leeds.", "Not specified", ["lease", "fragrance", "flavour", "clinic", "donate", "advisory", "expertise"], null],
  ])("%s gets its own sector and no other industry's wording", async (name, description, label, forbidden, savedKey) => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor(name, description) });
    // Saved as inferred (never as a customer choice), so a saved leasing choice cannot leak into other brands.
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(onboardingDoc({ sector: savedKey ? { key: savedKey, source: "inferred" } : { key: null, source: null }, industry_text: null }));
    render(<App />);
    await screen.findByRole("heading", { name: `Welcome back, ${name}.` });
    expect(screen.getByText(label, { selector: ".ps-chip" })).toBeInTheDocument();
    const text = document.body.textContent.split(name).join(" ").split(description).join(" ").toLowerCase();
    for (const term of forbidden) expect(text.includes(term), `${name} must not mention ${term}`).toBe(false);
    if (name !== "Fonzo") expect(text).not.toContain("fonzo");
  });
});

describe("missing Brand Brain information", () => {
  it("opens onboarding where the profile is incomplete, with the saved name prefilled and nothing invented", async () => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Northgate Vehicle Leasing") });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /what does your business do/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("");
    expect(screen.queryByRole("heading", { name: /welcome back/i })).toBeNull();
  });

  it("says so, and shows nothing as saved, when the Brand Brain cannot be loaded, then recovers on retry", async () => {
    let attempts = 0;
    handlers["GET /customer/workspace/brand-brain"] = () => (++attempts === 1 ? fail(500) : ok({ status: "ready", brand_brain: NORTHGATE }));
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/brand brain could not be loaded/i);
    // The message is said once, not repeated by the underlying error text.
    expect(alert.textContent.match(/could not be loaded/gi)).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: /welcome back/i })).toBeNull();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    // Unknown is not "missing": no field is reported as absent, and no next step is guessed, while it cannot load.
    expect(screen.queryByText("Missing")).toBeNull();
    expect(screen.queryByText("Not provided yet")).toBeNull();
    expect(screen.queryByRole("heading", { name: /recommended next steps/i })).toBeNull();
    expect(screen.getAllByText(/shown once your brand brain loads/i).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("does not leave a spinner forever when the backend never answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      handlers["GET /customer/workspace/brand-brain"] = () => new Promise(() => {});
      render(<App />);
      await waitFor(() => expect(called("GET", "/brand-brain")).toHaveLength(1));
      await act(async () => { await vi.advanceTimersByTimeAsync(21000); });
      expect(await screen.findByRole("alert")).toHaveTextContent(/taking longer than expected/i);
    } finally { vi.useRealTimers(); }
  });
});

describe("workspace creation (existing bootstrap contract)", () => {
  beforeEach(() => { getCustomerSessionMock.mockResolvedValue(SCOPE_MISSING); });
  const toIdentity = async () => { render(<App />); await screen.findByRole("heading", { name: /let.s set up your workspace/i }); fireEvent.click(button(/^continue$/i)); await screen.findByRole("heading", { name: /tell us about your business/i }); };

  it("requires a business name and creates nothing without one", async () => {
    await toIdentity();
    fireEvent.click(button(/create my workspace/i));
    expect(await screen.findByText(/enter your business name/i)).toBeInTheDocument();
    expect(called("POST", "/bootstrap")).toHaveLength(0);
  });

  it("sends exactly what the customer entered, omits empty optional fields, and never uses the legacy name heuristic", async () => {
    getCustomerSessionMock.mockResolvedValueOnce(SCOPE_MISSING).mockResolvedValue(SESSION_A);
    await toIdentity();
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Northgate Vehicle Leasing" } });
    fireEvent.click(button(/create my workspace/i));
    await screen.findByRole("heading", { name: /what does your business do/i });
    const [req] = called("POST", "/bootstrap");
    expect(JSON.parse(req.options.body)).toEqual({ business_name: "Northgate Vehicle Leasing" });
    expect(req.options.headers.authorization).toBe("Bearer token-new");
    expect(JSON.stringify(calls.map((c) => c.options.body))).not.toMatch(/Customer Campaign Workspace|Lease Expert/);
  });

  it("includes the website and challenge only when entered", async () => {
    getCustomerSessionMock.mockResolvedValueOnce(SCOPE_MISSING).mockResolvedValue(SESSION_A);
    await toIdentity();
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Northgate Vehicle Leasing" } });
    fireEvent.change(screen.getByLabelText(/website or social profile/i), { target: { value: "https://northgate.example" } });
    fireEvent.change(screen.getByLabelText(/most want help with/i), { target: { value: "More enquiries" } });
    fireEvent.click(button(/create my workspace/i));
    await screen.findByRole("heading", { name: /what does your business do/i });
    expect(JSON.parse(called("POST", "/bootstrap")[0].options.body)).toEqual({ business_name: "Northgate Vehicle Leasing", website_or_social_profile: "https://northgate.example", primary_marketing_challenge: "More enquiries" });
  });

  it("does not submit twice when the button is pressed repeatedly", async () => {
    let release;
    handlers["POST /customer/workspace/bootstrap"] = () => new Promise((resolve) => { release = () => resolve(ok({ status: "ready", workspace: {}, requires_session_refresh: false }, 201)); });
    getCustomerSessionMock.mockResolvedValueOnce(SCOPE_MISSING).mockResolvedValue(SESSION_A);
    await toIdentity();
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Northgate Vehicle Leasing" } });
    const create = button(/create my workspace/i);
    fireEvent.click(create); fireEvent.click(create); fireEvent.click(create);
    await waitFor(() => expect(called("POST", "/bootstrap")).toHaveLength(1));
    expect(button(/creating your workspace/i)).toBeDisabled();
    await act(async () => { release(); });
    await screen.findByRole("heading", { name: /what does your business do/i });
    expect(called("POST", "/bootstrap")).toHaveLength(1);
  });

  it("reports a failed creation honestly and stays on the step", async () => {
    handlers["POST /customer/workspace/bootstrap"] = () => fail(500);
    await toIdentity();
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Northgate Vehicle Leasing" } });
    fireEvent.click(button(/create my workspace/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be created yet\. nothing was saved/i);
    expect(screen.getByRole("heading", { name: /tell us about your business/i })).toBeInTheDocument();
  });

  it("will not guess when the customer has several workspaces", async () => {
    handlers["GET /customer/workspace"] = () => ok({ status: "selection_required", workspace: null, workspaces: [{}, {}] });
    await toIdentity();
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: "Northgate Vehicle Leasing" } });
    fireEvent.click(button(/create my workspace/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/more than one workspace/i);
    expect(called("POST", "/bootstrap")).toHaveLength(0);
  });
});

describe("what is saved, and what is not", () => {
  const toBrainStep = async () => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Northgate Vehicle Leasing") });
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(NOT_STARTED);
    render(<App />);
    await screen.findByRole("heading", { name: /what does your business do/i });
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "vehicle leasing" } });
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "We lease cars to small businesses." } });
    fireEvent.change(screen.getByLabelText(/what should a customer do next/i), { target: { value: "Request a quote" } });
    fireEvent.click(button(/^continue$/i));
    fireEvent.change(await screen.findByLabelText(/who are your customers/i), { target: { value: "Small business owners" } });
    fireEvent.change(screen.getByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Get more lease enquiries" } });
    fireEvent.click(button(/^continue$/i));
    fireEvent.click(await screen.findByRole("button", { name: /^Instagram/ }));
    fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /your brand brain/i });
  };

  it("saves only description, audience and customer action to the existing Brand Brain endpoint, and nothing else", async () => {
    await toBrainStep();
    expect(called("PUT", "/brand-brain")).toHaveLength(0); // typing saves nothing
    fireEvent.click(button(/save to brand brain/i));
    expect(await screen.findByText(/saved to your brand brain/i)).toBeInTheDocument();
    const [req] = called("PUT", "/brand-brain");
    const body = JSON.parse(req.options.body);
    expect(body).toMatchObject({ name: "Northgate Vehicle Leasing", identity: { description: "We lease cars to small businesses." }, audience: { summary: "Small business owners" }, commercial: { primary_cta: "Request a quote" } });
    for (const key of ["brand_id", "project_id", "metadata"]) expect(body).not.toHaveProperty(key);
    const wire = JSON.stringify(body);
    // Typed in the session only: the lower-case industry text, the channel, the sector and the goal.
    expect(wire).not.toMatch(/Instagram|sector|"vehicle leasing"|Get more lease enquiries/);
    expect(req.options.headers.authorization).toBe("Bearer token-a");
  });

  it("never claims a save that failed", async () => {
    await toBrainStep();
    handlers["PUT /customer/workspace/brand-brain"] = () => fail(400);
    fireEvent.click(button(/save to brand brain/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved yet/i);
    expect(screen.queryByText(/saved to your brand brain/i)).toBeNull();
  });

  it("Brand Brain saves still carry nothing about sector or channels", async () => {
    await toBrainStep();
    fireEvent.click(button(/save to brand brain/i));
    await screen.findByText(/saved to your brand brain/i);
    const [req] = called("PUT", "/brand-brain");
    expect(JSON.stringify(JSON.parse(req.options.body))).not.toMatch(/instagram|sector|channel/i);
    expect(called("PUT", "/workspace/onboarding")).toHaveLength(0); // saving the Brand Brain is not saving setup progress
  });

  it("labels an unsaved sector and unsaved channels as such, and a saved one as saved", async () => {
    await toBrainStep();
    fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i));
    expect(screen.getByText(/Inferred from what you typed · not saved yet/i)).toBeInTheDocument();
    for (const c of calls) expect(String(c.options.body || "")).not.toMatch(/instagram|vehicle leasing/i);
  });
});

describe("recommendation, campaign and review safety inside the premium shell", () => {
  async function toStudioWithRecommendation() {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Get more lease enquiries" } });
    for (let i = 0; i < 3; i++) fireEvent.click(button(/^continue$/i)); // customers, channels, Brand Brain, then recommendation
    await screen.findByRole("heading", { name: /your first recommendation/i });
    fireEvent.click(button(/get my recommendation/i));
    await screen.findByRole("heading", { name: "Lease Enquiry Campaign" });
  }

  it("requests one recommendation with the typed goal and the session's own scope", async () => {
    await toStudioWithRecommendation();
    const recs = called("POST", "/campaign-recommendations");
    expect(recs).toHaveLength(1);
    expect(JSON.parse(recs[0].options.body)).toMatchObject({ tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", goal: "Get more lease enquiries" });
    expect(recs[0].options.headers.authorization).toBe("Bearer token-a");
    expect(screen.getByText(/nothing has been created, scheduled or published/i)).toBeInTheDocument();
    expect(called("POST", "/campaigns")).toHaveLength(0);
  });

  it("keeps preview, explicit acknowledgement and approval intact, and never implies publication", async () => {
    await toStudioWithRecommendation();
    fireEvent.click(button(/continue in campaign studio/i));
    fireEvent.click(await screen.findByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");
    expect(called("POST", "/preview-acknowledgements")).toHaveLength(0);
    expect(called("POST", "/approval")).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
    expect(screen.getByText(/manual publication required/i)).toBeInTheDocument();
    expect(calls.some((c) => /publish|schedule/i.test(c.path) && !/manual-publication/.test(c.path))).toBe(false);
    for (const c of calls.filter((x) => x.method === "POST" && /preview-renders|acknowledgements|approval/.test(x.path))) expect(JSON.parse(c.options.body).idempotency_key).toMatch(/^op:[a-z-]+:[0-9a-f]{64}$/);
  });

  it("fails closed with an explanation and no retry loop when the destination has no preview profile", async () => {
    handlers["POST /customer/campaigns/*/variants/*/preview-renders"] = () => fail(409, { error: { code: "PREVIEW_VERSION_UNAVAILABLE" } });
    await toStudioWithRecommendation();
    fireEvent.click(button(/continue in campaign studio/i));
    fireEvent.click(await screen.findByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /^render preview$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't available for this destination and format/i);
    expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /acknowledge preview|^approve$/i })).toBeNull();
    const settled = calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(calls.length).toBe(settled);
    expect(called("POST", "/preview-renders")).toHaveLength(1);
  });
});

describe("existing campaigns are restored from the backend", () => {
  const summary = (id, name, updated, extra = {}) => ({ campaign_id: id, name, status: "active", archived_at: null, updated_at: updated, ...extra });
  const IDS = { newest: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", older: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", archived: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };

  it("restores the newest real campaign after a refresh, lists the rest, and leaves archived ones out", async () => {
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [
      summary(IDS.older, "Older campaign", "2026-09-01T09:00:00.000Z"),
      summary(IDS.newest, "Newest campaign", "2026-10-20T09:00:00.000Z"),
      summary(IDS.archived, "Archived campaign", "2026-10-22T09:00:00.000Z", { archived_at: "2026-10-22T10:00:00.000Z" }),
    ] });
    handlers[`GET /customer/campaigns/${IDS.newest}`] = () => ok({ campaign: { ...campaignDoc(7, 1, "review"), campaign_id: IDS.newest, name: "Newest campaign" } });
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    const list = await screen.findByRole("heading", { name: "Your campaigns" });
    const card = list.closest("section");
    expect(within(card).getByText("Newest campaign")).toBeInTheDocument();
    expect(within(card).getByText("Older campaign")).toBeInTheDocument();
    expect(within(card).queryByText("Archived campaign")).toBeNull();
    expect(await screen.findByText(/1 item waiting for your review/i)).toBeInTheDocument();
    const [listCall] = called("GET", "/customer/campaigns");
    expect(listCall.options.headers.authorization).toBe("Bearer token-a");
    expect(new URL(listCall.url).searchParams.get("tenant_id")).toBe("tenant-a");
    expect(new URL(listCall.url).searchParams.get("project_id")).toBe("project-a");
    expect(calls.filter((c) => c.method === "GET" && c.path === `/customer/campaigns/${IDS.newest}`)).toHaveLength(1);
    expect(calls.some((c) => c.path.endsWith(`${IDS.older}`) || c.path.endsWith(`${IDS.archived}`))).toBe(false);
    expect(called("POST", "/customer/campaigns")).toHaveLength(0);
  });

  it("the restored campaign is the real one in Campaign Studio, with review still explicit", async () => {
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [summary(IDS.newest, "Newest campaign", "2026-10-20T09:00:00.000Z")] });
    handlers[`GET /customer/campaigns/${IDS.newest}`] = () => ok({ campaign: { ...campaignDoc(7, 1, "review"), campaign_id: IDS.newest, name: "Newest campaign" } });
    render(<App />);
    await screen.findByRole("heading", { name: /welcome back/i });
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Campaign Studio" }));
    expect(await screen.findByRole("button", { name: /^render preview$/i })).toBeInTheDocument();
    expect(called("POST", "/preview-acknowledgements")).toHaveLength(0);
    expect(called("POST", "/approval")).toHaveLength(0);
  });

  it("says plainly when the campaigns cannot be loaded, keeps the workspace usable, and recovers on retry", async () => {
    let attempts = 0;
    handlers["GET /customer/campaigns"] = () => (++attempts === 1 ? fail(500) : ok({ campaigns: [] }));
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/campaigns could not be loaded/i);
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByText(/you have no campaigns yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  });

  it("shows an empty, honest state when there are no campaigns", async () => {
    render(<App />);
    expect(await screen.findByText(/you have no campaigns yet\. nothing has been created, scheduled or published/i)).toBeInTheDocument();
  });

  it("never carries one account's campaigns into another account", async () => {
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [summary(IDS.newest, "Account A campaign", "2026-10-20T09:00:00.000Z")] });
    handlers[`GET /customer/campaigns/${IDS.newest}`] = () => ok({ campaign: { ...campaignDoc(7, 1, "review"), campaign_id: IDS.newest, name: "Account A campaign" } });
    render(<App />);
    expect((await screen.findAllByText("Account A campaign", { selector: "strong" })).length).toBeGreaterThanOrEqual(1);
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [] });
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    expect(await screen.findByText(/you have no campaigns yet/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Account A campaign");
    expect(new URL(called("GET", "/customer/campaigns").pop().url).searchParams.get("tenant_id")).toBe("tenant-b");
  });
});

describe("account and workspace isolation", () => {
  it("never shows one account's data to another when the session changes", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    await act(async () => { await authListener(); });
    expect(await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Northgate");
    expect(called("GET", "/brand-brain").pop().options.headers.authorization).toBe("Bearer token-b");
  });

  it("ignores a slow response that belongs to the previous account", async () => {
    let releaseA;
    handlers["GET /customer/workspace/brand-brain"] = () => new Promise((resolve) => { releaseA = () => resolve(ok({ status: "ready", brand_brain: NORTHGATE })); });
    render(<App />);
    await waitFor(() => expect(called("GET", "/brand-brain")).toHaveLength(1));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    await act(async () => { releaseA(); });
    expect(screen.getByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Northgate");
  });

  it("clears everything, including typed answers and a recommendation, on sign-out", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Secret goal text" } });
    getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
    await act(async () => { await authListener(); });
    expect(await screen.findByRole("heading", { name: /sign in to bizgenie/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Secret goal text|Northgate/);
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    expect(await screen.findByLabelText(/what do you want a campaign to achieve/i)).toHaveValue("");
  });
});

describe("refresh and navigation", () => {
  it("a fresh load lands in the right place from saved data alone, with no local completion flag", async () => {
    const first = render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    first.unmount();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." })).toBeInTheDocument();
  });

  it("moving between sections keeps what was typed this session and marks the current section", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: /welcome back/i });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "More enquiries" } });
    const nav = screen.getByRole("navigation", { name: /workspace sections/i });
    fireEvent.click(within(nav).getByRole("button", { name: "Overview" }));
    expect((await screen.findAllByText("More enquiries")).length).toBeGreaterThanOrEqual(1);
    expect(within(nav).getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(within(nav).getByRole("button", { name: "Campaign Studio" }));
    expect(await screen.findByText(/there is no campaign yet/i)).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Calendar" }));
    expect(await screen.findByText(/create a campaign to see its calendar/i)).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Brand" }));
    expect(await screen.findByRole("region", { name: /brand brain/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// BG-STUDIO-010-FE: persistent onboarding. The API is MOCKED here with the workspace-onboarding.v1 shapes from API
// draft PR #213 (head d0e1142). This is NOT connected-staging evidence: no real API, database, token or migration.
// ---------------------------------------------------------------------------------------------------------------
const draftBrain = (name, over = {}) => ({ ...brainFor(name), ...over });
const IN_PROGRESS = (over = {}) => onboardingDoc({ version: 2, status: "in_progress", completed_at: null, current_step: 4, completeness: { sector: true, channels: false, ready_to_complete: false, missing: ["channels"] }, channels: { values: [], source: null }, ...over });

// A small stand-in for the API's merge/compare-and-set behaviour, enough to exercise the client truthfully.
function fakeServer(initial) {
  const state = { doc: initial, puts: [], lastKey: null, lastHash: null };
  const handler = (_u, options) => {
    const body = JSON.parse(options.body);
    state.puts.push(body);
    if (state.lastKey === body.idempotency_key && state.lastHash === JSON.stringify({ ...body, idempotency_key: undefined })) return ok({ status: "saved", replayed: true, onboarding: state.doc, brand_name_placeholder: false });
    if (body.expected_version !== state.doc.version) return fail(409, { status: "failed", error: { code: "VERSION_CONFLICT", message: "changed", details: { current_version: state.doc.version } } });
    const d = { ...state.doc, sector: { ...state.doc.sector }, channels: { ...state.doc.channels }, draft: { ...state.doc.draft } };
    if (body.sector_key !== undefined) d.sector = body.sector_key === null ? { key: null, source: null } : { key: body.sector_key, source: body.sector_source || "customer" };
    if (body.industry_text !== undefined) d.industry_text = body.industry_text;
    if (body.channels !== undefined) d.channels = body.channels.length ? { values: body.channels, source: body.channels_source || "customer" } : { values: [], source: null };
    if (body.current_step !== undefined) d.current_step = body.current_step;
    for (const [k, v] of Object.entries(body.draft || {})) { if (v === null) delete d.draft[k]; else d.draft[k] = v; }
    if (body.complete === true) { d.status = "completed"; d.completed_at = "2026-10-23T11:00:00.000Z"; } else d.status = body.complete === false ? "in_progress" : (d.status === "not_started" ? "in_progress" : d.status);
    d.version = state.doc.version + 1; d.updated_at = "2026-10-23T11:00:00.000Z";
    d.completeness = { sector: Boolean(d.sector.key), channels: d.channels.values.length > 0, ready_to_complete: Boolean(d.sector.key) && d.channels.values.length > 0, missing: [] };
    state.doc = d; state.lastKey = body.idempotency_key; state.lastHash = JSON.stringify({ ...body, idempotency_key: undefined });
    return ok({ status: "saved", replayed: false, onboarding: d, brand_name_placeholder: false });
  };
  return { state, get: () => onboardingResponse(state.doc), put: handler };
}
const use = (server) => { handlers["GET /customer/workspace/onboarding"] = server.get; handlers["PUT /customer/workspace/onboarding"] = server.put; };
const onboardingPuts = () => called("PUT", "/workspace/onboarding");
const heading = (re) => screen.findByRole("heading", { name: re });
const stageHeadings = { 2: /what does your business do/i, 3: /who do you serve/i, 4: /where would you like to reach customers/i, 5: /your brand brain/i };

describe("persistent onboarding: returning customers and resume", () => {
  it("a customer who confirmed setup lands on the workspace; the API is read with the bearer token only and writes nothing", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    const [get] = called("GET", "/workspace/onboarding");
    expect(get.options.headers.authorization).toBe("Bearer token-a");
    expect(get.url).not.toMatch(/tenant|project|brand|token/i); // scope is never sent; the token carries it
    expect(onboardingPuts()).toHaveLength(0);
  });

  it("resumes an unfinished setup at the saved step with the saved sector, channels and unsaved answers", async () => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, industry_text: "niche fragrance", channels: { values: ["instagram", "email"], source: "customer" }, draft: { goal: "Sell more discovery sets", description: "Typed but never saved to the Brand Brain" } }));
    use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    await heading(stageHeadings[4]);
    expect(screen.getByRole("button", { name: /^Instagram/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Email/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^TikTok/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/saved \(version 2\)/i);
    fireEvent.click(button(/^back$/i)); // customers and goal
    expect(await screen.findByLabelText(/what do you want a campaign to achieve/i)).toHaveValue("Sell more discovery sets");
    fireEvent.click(button(/^back$/i)); // what you do
    expect(await screen.findByLabelText(/what kind of business/i)).toHaveValue("niche fragrance");
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("Typed but never saved to the Brand Brain");
    expect(screen.getByLabelText(/sector used for guidance/i)).toHaveValue("perfume");
    expect(screen.getByText(/saved · you chose this/i, { selector: ".ps-sector-status *, .ps-sector-status" })).toBeInTheDocument();
    expect(onboardingPuts()).toHaveLength(0); // resuming writes nothing
  });

  it("resuming after sign-in restores the same place (a new render with the same saved record)", async () => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "charity", source: "customer" } }));
    use(server);
    const first = render(<App />);
    await heading(stageHeadings[4]);
    first.unmount();
    render(<App />);
    await heading(stageHeadings[4]);
  });

  it("does not call a bootstrap-populated Brand Brain complete: setup resumes and the seeded address is not shown as a description", async () => {
    use(fakeServer(NOT_STARTED));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: draftBrain("Halal Motor Leasing Ltd", { identity: { description: "Customer-provided website or profile: https://leaseexpert.example" }, commercial: { primary_cta: "Get more Audi A3 leasing enquiries" } }) });
    render(<App />);
    await heading(/what does your business do/i); // not the workspace overview
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("");
    expect(document.body.textContent).not.toMatch(/welcome back/i);
    fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i));
    await heading(stageHeadings[5]);
    expect(screen.getByText(/only a web address is stored here/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("leaseexpert.example");
    expect(button(/confirm setup/i)).toBeDisabled();
    expect(screen.getByRole("list", { name: /still needed to confirm/i })).toHaveTextContent(/save your sector/i);
    expect(screen.getByRole("list", { name: /still needed to confirm/i })).toHaveTextContent(/website address is not a description/i);
  });

  it("a returning customer whose Brand Brain has a real name and description but never confirmed setup is not marked complete", async () => {
    use(fakeServer(NOT_STARTED));
    render(<App />); // NORTHGATE has a name and description
    await heading(/what does your business do|tell us about your business/i);
    expect(document.body.textContent).not.toMatch(/welcome back/i);
  });
});

describe("persistent onboarding: Save progress, Save and exit, and confirmation", () => {
  const fillAbout = () => {
    fireEvent.change(screen.getByLabelText(/what kind of business/i), { target: { value: "niche fragrance" } });
    fireEvent.change(screen.getByLabelText(/sector used for guidance/i), { target: { value: "perfume" } });
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Small-batch perfume house." } });
  };

  it("Save and exit sends exactly the verified PUT contract, then opens the workspace and says what is saved", async () => {
    const server = fakeServer(NOT_STARTED); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    await heading(stageHeadings[2]);
    fillAbout();
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/changes that are not saved yet/i);
    fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i));
    fireEvent.click(await screen.findByRole("button", { name: /^Instagram/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Email/ }));
    expect(onboardingPuts()).toHaveLength(0); // clicking saves nothing
    fireEvent.click(button(/save and exit/i));
    await screen.findByRole("navigation", { name: /workspace sections/i });
    await screen.findByRole("heading", { name: /^Welcome/ });
    const [put] = onboardingPuts();
    const body = JSON.parse(put.options.body);
    expect(Object.keys(body).sort()).toEqual(["channels", "channels_source", "current_step", "draft", "expected_version", "idempotency_key", "industry_text", "sector_key", "sector_source"]);
    expect(body).toMatchObject({ expected_version: 0, sector_key: "perfume", sector_source: "customer", channels: ["instagram", "email"], channels_source: "customer", industry_text: "niche fragrance", current_step: 4, draft: { description: "Small-batch perfume house." } });
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(JSON.stringify(body)).not.toMatch(/tenant|project|brand_id|token/i);
    expect(put.options.headers.authorization).toBe("Bearer token-a");
    // Brand Brain is untouched by saving setup progress.
    expect(called("PUT", "/brand-brain")).toHaveLength(0);
    // The overview shows what is saved, with provenance, and offers to continue.
    const facts = screen.getByRole("heading", { name: /what bizgenie knows/i }).closest("section");
    expect(within(facts).getByText("Instagram, Email")).toBeInTheDocument();
    expect(within(facts).getAllByText(/Saved · you chose/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /continue your setup/i })).toBeInTheDocument();
  });

  it("an inferred sector is saved as inferred, never as a customer choice", async () => {
    const server = fakeServer(NOT_STARTED); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Northgate Vehicle Leasing") });
    render(<App />);
    await heading(stageHeadings[2]);
    expect(screen.getByText(/Inferred from what you typed · not saved yet/i)).toBeInTheDocument();
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    expect(JSON.parse(onboardingPuts()[0].options.body)).toMatchObject({ sector_key: "leasing", sector_source: "inferred" });
    expect(screen.getByText(/saved · inferred from what you typed, not confirmed/i)).toBeInTheDocument();
  });

  it("an inferred sector is never sent over a saved customer choice", async () => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" } })); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Northgate Vehicle Leasing") });
    render(<App />);
    await heading(stageHeadings[4]);
    fireEvent.click(await screen.findByRole("button", { name: /^Email/ }));
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    const body = JSON.parse(onboardingPuts()[0].options.body);
    expect(body).not.toHaveProperty("sector_key");
    expect(body).not.toHaveProperty("sector_source");
    expect(server.state.doc.sector).toEqual({ key: "perfume", source: "customer" });
  });

  it("saves nothing, and says so, when there is nothing new", async () => {
    use(fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 4 })));
    render(<App />);
    await heading(stageHeadings[4]);
    fireEvent.click(button(/^save progress$/i));
    expect(await screen.findByText(/already saved/i)).toBeInTheDocument();
    expect(onboardingPuts()).toHaveLength(0);
  });

  it("presses twice, sends once", async () => {
    let release; const server = fakeServer(NOT_STARTED); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    await heading(stageHeadings[2]);
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Typed" } });
    handlers["PUT /customer/workspace/onboarding"] = (u, o) => new Promise((resolve) => { release = () => resolve(server.put(u, o)); });
    const save = button(/^save progress$/i);
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(typeof release).toBe("function"));
    expect(onboardingPuts()).toHaveLength(1);
    await act(async () => { release(); });
    await screen.findByText(/setup progress saved\. you can leave/i);
    expect(onboardingPuts()).toHaveLength(1);
  });

  it("Confirm setup is enabled only from saved, customer-supplied facts, and sends only the completion", async () => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 5, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] } })); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle", "A small-batch perfume house.") });
    render(<App />);
    await heading(stageHeadings[5]);
    fireEvent.click(button(/confirm setup/i));
    await screen.findByText(/setup confirmed and saved/i);
    const body = JSON.parse(onboardingPuts()[0].options.body);
    expect(body).toMatchObject({ expected_version: 2, complete: true });
    expect(Object.keys(body).sort()).toEqual(["complete", "expected_version", "idempotency_key"]);
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Maison Aurelle." })).toBeInTheDocument();
    expect(screen.getByText(/Setup confirmed by you\. 2 details are still not provided\./)).toBeInTheDocument();
  });

  it("Confirm setup is blocked when the backend flags the name as a placeholder, or typing is unsaved", async () => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 5 })); use(server);
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(server.state.doc, { brand_name_placeholder: true });
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("BizGenie Workspace", "A small-batch perfume house.") });
    render(<App />);
    await heading(stageHeadings[5]);
    expect(button(/confirm setup/i)).toBeDisabled();
    expect(screen.getByRole("list", { name: /still needed to confirm/i })).toHaveTextContent(/real business name/i);
  });
});

describe("persistent onboarding: interrupted saves, conflicts and unavailable storage", () => {
  const toAbout = async (server, brainName = "Maison Aurelle") => {
    use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor(brainName) });
    render(<App />);
    await heading(stageHeadings[2]);
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Small-batch perfume house." } });
  };

  it("503 on a save: 'save not confirmed', never 'NOT saved'; keeps the typed answers and never claims success", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    handlers["PUT /customer/workspace/onboarding"] = () => fail(503, { status: "failed", error: { code: "ONBOARDING_UNAVAILABLE", message: "Onboarding is temporarily unavailable" } });
    fireEvent.click(button(/save and exit/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Save not confirmed — your changes may already have been saved.");
    expect(alert.textContent).not.toMatch(/NOT saved/);
    expect(within(alert).getByRole("button", { name: /check what was saved/i })).toBeInTheDocument();
    expect(screen.queryByText(/progress saved|already saved/i)).toBeNull();
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("Small-batch perfume house.");
    expect(screen.getByRole("heading", { name: stageHeadings[2] })).toBeInTheDocument(); // did not navigate away
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/not saved yet/i);
  });

  it("an interrupted save is retried with the SAME idempotency key, and a replay is accepted", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    let attempts = 0;
    handlers["PUT /customer/workspace/onboarding"] = (u, o) => { attempts += 1; if (attempts === 1) { server.put(u, o); throw new TypeError("network lost"); } return server.put(u, o); };
    fireEvent.click(button(/^save progress$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save not confirmed — your changes may already have been saved.");
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    const [first, second] = onboardingPuts().map((c) => JSON.parse(c.options.body));
    expect(second.idempotency_key).toBe(first.idempotency_key);
    expect(second).toEqual(first);
    expect(server.state.doc.version).toBe(1); // written once, not twice
  });

  it("a changed answer after a failed save gets a new idempotency key", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    handlers["PUT /customer/workspace/onboarding"] = () => fail(503, { status: "failed", error: { code: "ONBOARDING_UNAVAILABLE", message: "x" } });
    fireEvent.click(button(/^save progress$/i)); await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Changed wording." } });
    fireEvent.click(button(/^save progress$/i)); await waitFor(() => expect(onboardingPuts()).toHaveLength(2));
    const [a, b] = onboardingPuts().map((c) => JSON.parse(c.options.body));
    expect(b.idempotency_key).not.toBe(a.idempotency_key);
  });

  it("a stale version reloads the latest saved record, keeps what was typed, and retries with the new version", async () => {
    const server = fakeServer(IN_PROGRESS({ version: 4, current_step: 2 })); await toAbout(server);
    // Another tab saved version 5 after this one loaded version 4.
    server.state.doc = { ...server.state.doc, version: 5, sector: { key: "beverage", source: "customer" } };
    fireEvent.click(button(/^save progress$/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/changed somewhere else/i);
    expect(alert).toHaveTextContent(/typed answers are still here/i);
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("Small-batch perfume house.");
    expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/not saved yet/i);
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved \(version 6\)/i);
    const bodies = onboardingPuts().map((c) => JSON.parse(c.options.body));
    expect(bodies[0].expected_version).toBe(4);
    expect(bodies[1].expected_version).toBe(5);
    expect(bodies[1].idempotency_key).not.toBe(bodies[0].idempotency_key);
  });

  it("validation, authorisation and unexpected failures say nothing was saved", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    for (const [response, pattern] of [
      [fail(400, { error: { code: "ONBOARDING_VALIDATION_ERROR", details: [{ path: "channels", message: "bad" }] } }), /some answers could not be saved.*nothing was saved/i],
      [fail(401, { error: { code: "AUTHENTICATION_REQUIRED" } }), /session has ended.*nothing was saved/i],
      [fail(403, { error: { code: "WORKSPACE_NOT_AUTHORIZED" } }), /only the workspace owner can save or confirm setup.*nothing was saved/i],
      [fail(500, {}), /could not be saved.*nothing was saved/i],
    ]) {
      handlers["PUT /customer/workspace/onboarding"] = () => response;
      fireEvent.click(button(/^save progress$/i));
      expect(await screen.findByRole("alert")).toHaveTextContent(pattern);
      expect(screen.queryByText(/progress saved/i)).toBeNull();
    }
  });

  it("an unexpected response shape is not trusted", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    handlers["PUT /customer/workspace/onboarding"] = () => ok({ status: "saved", onboarding: { version: "7" } });
    fireEvent.click(button(/^save progress$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unexpected answer/i);
    expect(screen.queryByText(/progress saved/i)).toBeNull();
  });

  it("when saved setup cannot be loaded (503) the workspace says so instead of calling setup complete or incomplete, then recovers", async () => {
    let up = false;
    handlers["GET /customer/workspace/onboarding"] = () => (up ? onboardingResponse(onboardingDoc()) : fail(503, { status: "failed", error: { code: "ONBOARDING_UNAVAILABLE", message: "x" } }));
    render(<App />);
    await screen.findByRole("heading", { name: /^Welcome/ });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/saved setup could not be loaded/i);
    expect(alert).toHaveTextContent(/could not be loaded right now.*nothing has been changed/i);
    expect(screen.getByText("Unavailable", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText("Needs your input")).toBeNull();
    expect(screen.queryByText("Complete")).toBeNull();
    up = true;
    fireEvent.click(within(alert).getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("an API without the onboarding routes (404) is treated as unavailable, never as an empty record", async () => {
    handlers["GET /customer/workspace/onboarding"] = () => fail(404);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/saved setup could not be loaded/i);
    expect(screen.queryByText("Needs your input")).toBeNull();
  });

  it("unavailable storage during setup lets the customer keep working but warns that progress is not remembered", async () => {
    handlers["GET /customer/workspace/onboarding"] = () => fail(503, { error: { code: "ONBOARDING_UNAVAILABLE" } });
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/will not be remembered/i);
    expect(screen.queryByRole("button", { name: /save and exit/i })).toBeNull();
    expect(onboardingPuts()).toHaveLength(0);
  });
});

describe("persistent onboarding: backend placeholder flag, accounts and workspaces", () => {
  it("uses the backend flag, not a built-in list: the same string is a real name when the backend says so", async () => {
    use(fakeServer(onboardingDoc()));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Customer Campaign Workspace", "A bespoke tailoring shop.") });
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(onboardingDoc(), { brand_name_placeholder: false });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Welcome back, Customer Campaign Workspace." })).toBeInTheDocument();
  });

  it("never prefills a backend-flagged placeholder as the customer's business name", async () => {
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(NOT_STARTED, { brand_name_placeholder: true });
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("BizGenie Workspace") });
    render(<App />);
    await heading(/tell us about your business/i);
    expect(screen.getByLabelText(/business name/i)).toHaveValue("");
  });

  it("switching account loads that account's setup and shows nothing of the previous one", async () => {
    const a = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, draft: { goal: "Account A secret goal" } }));
    use(a);
    render(<App />);
    await heading(stageHeadings[4]);
    const b = fakeServer(onboardingDoc({ version: 9, sector: { key: "charity", source: "customer" } }));
    handlers["GET /customer/workspace/onboarding"] = b.get;
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    await act(async () => { await authListener(); });
    expect(await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Account A secret goal/);
    const gets = called("GET", "/workspace/onboarding");
    expect(gets[0].options.headers.authorization).toBe("Bearer token-a");
    expect(gets[gets.length - 1].options.headers.authorization).toBe("Bearer token-b");
  });

  it("ignores a slow onboarding response and a slow save that belong to the previous workspace", async () => {
    const a = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" } })); use(a);
    let releasePut;
    handlers["PUT /customer/workspace/onboarding"] = (u, o) => new Promise((resolve) => { releasePut = () => resolve(a.put(u, o)); });
    render(<App />);
    await heading(stageHeadings[4]);
    fireEvent.click(await screen.findByRole("button", { name: /^Email/ }));
    fireEvent.click(button(/^save progress$/i));
    await waitFor(() => expect(typeof releasePut).toBe("function"));
    const b = fakeServer(onboardingDoc({ version: 9, sector: { key: "charity", source: "customer" } }));
    handlers["GET /customer/workspace/onboarding"] = b.get;
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    await act(async () => { releasePut(); });
    // B's record is what is shown; A's late save is not applied to B.
    expect(screen.getByRole("heading", { name: "Welcome back, Brookside Aesthetics." })).toBeInTheDocument();
    expect(screen.getByText("Charity & community", { selector: ".ps-chip" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Fragrance/);
    // B's saved record is still what the workspace reflects: A's late save did not replace it.
    const facts = screen.getByRole("heading", { name: /what bizgenie knows/i }).closest("section");
    expect(within(facts).queryByText(/not saved yet/i)).toBeNull();
    expect(within(facts).getAllByText(/Saved · you chose/).length).toBeGreaterThanOrEqual(2);
  });

  it("changing to another workspace of the same account re-reads that workspace's own setup", async () => {
    use(fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" } })));
    render(<App />);
    await heading(stageHeadings[4]);
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(onboardingDoc({ sector: { key: "takeaway", source: "customer" } }));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Second Brand", "A takeaway on the high street.") });
    getCustomerSessionMock.mockResolvedValue({ ...SESSION_A, brandId: "brand-a2", projectId: "project-a2" });
    await act(async () => { await authListener(); });
    expect(await screen.findByRole("heading", { name: "Welcome back, Second Brand." })).toBeInTheDocument();
    expect(screen.getByText("Independent takeaway", { selector: ".ps-chip" })).toBeInTheDocument();
  });

  it("a customer with no workspace yet makes no onboarding request and is not offered Save and exit", async () => {
    getCustomerSessionMock.mockResolvedValue(SCOPE_MISSING);
    render(<App />);
    await screen.findByRole("heading", { name: /set up your workspace/i });
    fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /tell us about your business/i });
    expect(screen.queryByRole("button", { name: /save and exit/i })).toBeNull();
    expect(screen.getByText(/save and exit becomes available after your workspace is created/i)).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith("/onboarding"))).toHaveLength(0);
  });

  it("warns before leaving with unsaved answers, and not when everything is saved", async () => {
    const server = fakeServer(NOT_STARTED); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    await heading(stageHeadings[2]);
    const probe = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(probe()).toBe(false);
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Typed" } });
    expect(probe()).toBe(true);
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    expect(probe()).toBe(false);
  });

  it("with the flag off the onboarding API is never called", async () => {
    vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", "false");
    render(<App />);
    await screen.findByLabelText(/your goal/i);
    await act(async () => {});
    expect(calls.filter((c) => c.path.includes("/onboarding"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// BG-STUDIO-011-FE contract alignment with the HARDENED API (bizgenie-api PR #213 at 120a874):
//  - a 503 on a write may follow a commit whose acknowledgement was lost;
//  - 422 ONBOARDING_INCOMPLETE can now list business_name and description as well as sector_key and channels;
//  - only the workspace OWNER may write; a refused write is a plain 403 WORKSPACE_NOT_AUTHORIZED.
// The API is MOCKED here with those documented shapes. This is NOT staging evidence.
// ---------------------------------------------------------------------------------------------------------------
const WORKSPACE_ROW = (role) => ({ tenant_id: "tenant-a", tenant_name: "Northgate Group", project_id: "project-a", project_name: "Northgate campaigns", brand_id: "brand-a", brand_name: "Maison Aurelle", brand_status: "approved", membership_role: role });
const withRole = (role) => { handlers["GET /customer/workspace"] = () => ok({ status: "ready", workspace: WORKSPACE_ROW(role) }); };
const SAVE_NOT_CONFIRMED_TEXT = "Save not confirmed — your changes may already have been saved.";
const incomplete = (...paths) => fail(422, { status: "failed", error: { code: "ONBOARDING_INCOMPLETE", message: "Onboarding cannot be completed until required answers are saved", details: paths.map((path) => ({ path, code: "required", message: "Required to complete onboarding" })) } });

describe("hardened API: lost acknowledgements (503 after a commit)", () => {
  const toAbout = async (server) => {
    use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle") });
    render(<App />);
    await heading(stageHeadings[2]);
    fireEvent.change(screen.getByLabelText(/describe what the business does/i), { target: { value: "Small-batch perfume house." } });
  };

  it("the save COMMITTED but its acknowledgement was lost: says 'not confirmed', keeps the answers, and the retry replays the same request", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    let attempts = 0;
    handlers["PUT /customer/workspace/onboarding"] = (u, o) => { attempts += 1; const r = server.put(u, o); return attempts === 1 ? fail(503, { status: "failed", error: { code: "ONBOARDING_UNAVAILABLE", message: "Onboarding is temporarily unavailable" } }) : r; };
    fireEvent.click(button(/^save progress$/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SAVE_NOT_CONFIRMED_TEXT);
    expect(alert.textContent).not.toMatch(/NOT saved/i);
    expect(screen.queryByText(/setup progress saved\. you can leave/i)).toBeNull(); // success is never claimed
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("Small-batch perfume house.");
    expect(server.state.doc.version).toBe(1); // the server DID store it
    fireEvent.click(button(/^save progress$/i));
    await screen.findByText(/setup progress saved\. you can leave/i);
    const [first, second] = onboardingPuts().map((c) => JSON.parse(c.options.body));
    expect(second).toEqual(first); // same key AND same body, byte for byte
    expect(second.idempotency_key).toBe(first.idempotency_key);
    expect(server.state.doc.version).toBe(1); // never saved twice
  });

  it("'Check what was saved' re-reads the record and shows it as saved without re-sending anything", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    handlers["PUT /customer/workspace/onboarding"] = (u, o) => { server.put(u, o); return fail(503, { error: { code: "ONBOARDING_UNAVAILABLE" } }); };
    fireEvent.click(button(/^save progress$/i));
    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: /check what was saved/i }));
    await waitFor(() => expect(screen.getByTestId("ps-save-state")).toHaveTextContent(/saved \(version 1\)/i));
    expect(onboardingPuts()).toHaveLength(1);
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue("Small-batch perfume house.");
  });

  it("a lost acknowledgement on a dropped connection or a timeout says the same thing", async () => {
    const server = fakeServer(NOT_STARTED); await toAbout(server);
    handlers["PUT /customer/workspace/onboarding"] = () => { throw new TypeError("network lost"); };
    fireEvent.click(button(/^save and exit$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(SAVE_NOT_CONFIRMED_TEXT);
    expect(screen.getByRole("heading", { name: stageHeadings[2] })).toBeInTheDocument(); // did not leave
  });

  it("a read failure (503 on GET) changed nothing and does not use the save-uncertainty wording", async () => {
    handlers["GET /customer/workspace/onboarding"] = () => fail(503, { error: { code: "ONBOARDING_UNAVAILABLE" } });
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain(SAVE_NOT_CONFIRMED_TEXT);
    expect(alert).toHaveTextContent(/nothing has been changed/i);
  });
});

describe("hardened API: 422 incomplete business setup", () => {
  const atBrain = async (overrides = {}) => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 5, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, ...overrides })); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle", "A small-batch perfume house.") });
    render(<App />);
    await heading(stageHeadings[5]);
    return server;
  };

  it("lists exactly what the API says is missing, field by field, and confirms nothing", async () => {
    const server = await atBrain();
    handlers["PUT /customer/workspace/onboarding"] = () => incomplete("business_name", "description");
    fireEvent.click(button(/confirm setup/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/setup cannot be confirmed yet/i);
    expect(alert).toHaveTextContent(/nothing on this screen has been marked as confirmed/i);
    const list = within(alert).getByRole("list", { name: /what is still needed/i });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent(/Business name\..*no real business name yet.*placeholder/i);
    expect(list).toHaveTextContent(/What the business does\..*a website address alone is not a description/i);
    expect(server.state.doc.status).toBe("in_progress"); // nothing was marked complete
    expect(screen.queryByText(/setup confirmed and saved/i)).toBeNull();
    expect(screen.queryByText(/you confirmed your setup/i)).toBeNull();
  });

  it("each item can take the customer to the step that fixes it", async () => {
    await atBrain();
    handlers["PUT /customer/workspace/onboarding"] = () => incomplete("business_name", "description", "channels");
    fireEvent.click(button(/confirm setup/i));
    const list = await screen.findByRole("list", { name: /what is still needed/i });
    const items = within(list).getAllByRole("listitem");
    fireEvent.click(within(items[0]).getByRole("button", { name: /go to the step for: business name/i }));
    expect(await screen.findByRole("heading", { name: /tell us about your business/i })).toBeInTheDocument();
  });

  it("a stale 'ready' completeness from the server keeps Confirm closed even when this screen thinks the facts are saved", async () => {
    await atBrain({ completeness: { sector: true, channels: true, ready_to_complete: false, missing: ["business_name"] } });
    expect(button(/confirm setup/i)).toBeDisabled();
    expect(screen.getByRole("list", { name: /still needed to confirm/i })).toHaveTextContent(/real business name/i);
  });

  it("an inferred sector stays inferred after a refused confirmation", async () => {
    const server = await atBrain({ sector: { key: "perfume", source: "inferred" }, industry_text: null });
    handlers["PUT /customer/workspace/onboarding"] = () => incomplete("description");
    fireEvent.click(button(/confirm setup/i));
    await screen.findByRole("alert");
    fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i));
    expect(await screen.findByText(/saved · inferred from what you typed, not confirmed/i)).toBeInTheDocument();
    expect(server.state.doc.sector.source).toBe("inferred");
  });
});

describe("hardened API: only the workspace owner can write", () => {
  const atChannels = async (role) => {
    const server = fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 4 })); use(server);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Maison Aurelle", "A small-batch perfume house.") });
    if (role) withRole(role);
    render(<App />);
    await heading(stageHeadings[4]);
    return server;
  };

  it("a read-only member can read everything but Save, Save and exit and Confirm are turned off, with an accurate reason", async () => {
    const server = await atChannels("member");
    const note = await screen.findByText(/view only\. your role in this workspace is member/i);
    expect(note).toHaveTextContent(/only the workspace owner can save or confirm setup/i);
    expect(button(/^save progress$/i)).toBeDisabled();
    expect(button(/^save and exit$/i)).toBeDisabled();
    fireEvent.click(button(/^continue$/i)); // reading and navigating still work
    await heading(stageHeadings[5]);
    expect(button(/confirm setup/i)).toBeDisabled();
    // The saved setup is shown: authorised read access is preserved.
    fireEvent.click(button(/^back$/i));
    expect(screen.getByRole("button", { name: /^Email/ })).toHaveAttribute("aria-pressed", "true");
    expect(onboardingPuts()).toHaveLength(0);
    expect(server.state.doc.version).toBe(2);
  });

  it("typing as a read-only member is not 'unsaved work': no leave-page warning and no unsaved-changes notice", async () => {
    await atChannels("member");
    await screen.findByText(/view only/i);
    fireEvent.click(await screen.findByRole("button", { name: /^TikTok/ }));
    const probe = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(probe);
    expect(probe.defaultPrevented).toBe(false);
    expect(screen.queryByTestId("ps-save-state")).toBeNull();
  });

  it("the owner keeps every save control, and no view-only notice appears", async () => {
    await atChannels("owner");
    await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(0));
    expect(screen.queryByText(/view only/i)).toBeNull();
    expect(button(/^save progress$/i)).toBeEnabled();
    expect(button(/^save and exit$/i)).toBeEnabled();
  });

  it("when the role is not known the server decides: a refused write explains itself and the role is re-read", async () => {
    await atChannels(null); // GET /customer/workspace says missing_workspace here, so no role is known
    fireEvent.click(await screen.findByRole("button", { name: /^TikTok/ }));
    handlers["PUT /customer/workspace/onboarding"] = () => fail(403, { status: "failed", error: { code: "WORKSPACE_NOT_AUTHORIZED", message: "Workspace selection is not authorized" } });
    withRole("member"); // the re-read now says member
    const before = called("GET", "/customer/workspace").length;
    fireEvent.click(button(/^save progress$/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/only the workspace owner can save or confirm setup, or your access to this workspace has ended/i);
    expect(alert).toHaveTextContent(/nothing was saved/i);
    await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(before));
    expect(await screen.findByText(/view only\. your role in this workspace is member/i)).toBeInTheDocument();
    expect(button(/^save progress$/i)).toBeDisabled();
    expect(onboardingPuts()).toHaveLength(1); // one refused request, no loop
  });

  it("a read-only member also cannot send a save through the keyboard shortcut path: the handler refuses without a request", async () => {
    await atChannels("member");
    await screen.findByText(/view only/i);
    fireEvent.click(button(/^save progress$/i)); // disabled: nothing happens
    await act(async () => {});
    expect(onboardingPuts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Brand Brain identity ownership: founder decisions DEC-021 / LOCK-019 and DEC-022 / LOCK-020, backend draft PR
// bizgenie-api #214 at 2319e5e8. Only the workspace OWNER may change the business name and description; members keep every
// other Brand Brain edit. Response shapes below are the ones in #214's code and report (403 BRAND_BRAIN_WRITE_FORBIDDEN,
// 409 BRAND_BRAIN_VERSION_CONFLICT, 503). The API is MOCKED. Open contract questions are in the acceptance pack, section 12.3.
// ---------------------------------------------------------------------------------------------------------------
describe("Brand Brain identity ownership (DEC-021 / DEC-022)", () => {
  const DESCRIPTION = "A small-batch perfume house."; // the backend trims what it receives, then compares exactly with the stored text (#214, Q1)
  const STORED = brainFor("Maison Aurelle", DESCRIPTION, { audience: { summary: "Gift buyers." }, commercial: { primary_cta: "Shop the new scent" } });
  const forbidden = () => fail(403, { status: "failed", error: { code: "BRAND_BRAIN_WRITE_FORBIDDEN", message: "Current workspace-owner authority is required for business identity changes" } });
  const conflict = () => fail(409, { status: "failed", error: { code: "BRAND_BRAIN_VERSION_CONFLICT", message: "Brand Brain changed; reload before saving" } });
  let stored;
  const atBrain = async (role) => {
    stored = STORED;
    use(fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 5 })));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: stored });
    if (role) withRole(role);
    render(<App />);
    await heading(stageHeadings[5]);
    if (role) await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(0));
  };
  const brainPuts = () => called("PUT", "/brand-brain");
  const goBack = (n) => { for (let i = 0; i < n; i++) fireEvent.click(button(/^back$/i)); };
  const typeAudience = async (text) => {
    goBack(2); await heading(stageHeadings[3]);
    fireEvent.change(await screen.findByLabelText(/who are your customers/i), { target: { value: text } });
    fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i)); await heading(stageHeadings[5]);
  };

  it("a member sees the name and description as owner-only, and can still save who it serves and the customer action", async () => {
    await atBrain("member");
    await screen.findByText(/only the workspace owner can change the business name and description/i);
    expect(screen.getByRole("button", { name: /save who it serves and customer action/i })).toBeDisabled(); // nothing edited yet
    goBack(3); await heading(stageHeadings[2]);
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/describe what the business does/i)).toHaveValue(DESCRIPTION);
    expect(screen.getByText(/only the workspace owner can change the description of the business/i)).toBeInTheDocument();
    goBack(1);
    await heading(/tell us about your business/i);
    expect(screen.getByLabelText(/business name/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/business name/i)).toHaveValue("Maison Aurelle");
  });

  it("a member's save repeats the stored name and description exactly, changes only the other fields, and says so", async () => {
    await atBrain("member");
    await typeAudience("Collectors and gift buyers");
    fireEvent.click(button(/save who it serves and customer action/i));
    expect(await screen.findByText(/business name and description are unchanged/i)).toBeInTheDocument();
    expect(brainPuts()).toHaveLength(1);
    const body = JSON.parse(brainPuts()[0].options.body);
    expect(body.name).toBe("Maison Aurelle");
    expect(body.identity.description).toBe(DESCRIPTION);
    expect(body.audience.summary).toBe("Collectors and gift buyers");
    expect(body.commercial.primary_cta).toBe("Shop the new scent");
    for (const key of ["brand_id", "project_id", "metadata"]) expect(body).not.toHaveProperty(key);
  });

  it("the owner keeps full control: name and description are editable and are sent when changed", async () => {
    await atBrain("owner");
    expect(screen.queryByText(/only the workspace owner can change the business name and description/i)).toBeNull();
    expect(button(/^save to brand brain$/i)).toBeDisabled(); // nothing edited yet
    goBack(3); await heading(stageHeadings[2]);
    const box = screen.getByLabelText(/describe what the business does/i);
    expect(box).not.toHaveAttribute("readonly");
    fireEvent.change(box, { target: { value: "An independent perfume house in Paris." } });
    fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^continue$/i)); await heading(stageHeadings[5]);
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByText(/saved to your brand brain\. it is a draft/i)).toBeInTheDocument();
    expect(JSON.parse(brainPuts()[0].options.body).identity.description).toBe("An independent perfume house in Paris.");
  });

  it("a refused save (403) says who may change the name and description, keeps the typed answers, and asks who this customer is again", async () => {
    await atBrain("member");
    await typeAudience("Collectors");
    handlers["PUT /customer/workspace/brand-brain"] = forbidden;
    const roleReads = called("GET", "/customer/workspace").length;
    fireEvent.click(button(/save who it serves and customer action/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/only the workspace owner can change the business name and description/i);
    expect(alert).toHaveTextContent(/nothing was saved/i);
    expect(screen.queryByText(/saved to your brand brain/i)).toBeNull();
    await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(roleReads)); // the role is re-read
    goBack(2); await heading(stageHeadings[3]);
    expect(screen.getByLabelText(/who are your customers/i)).toHaveValue("Collectors"); // typed answer still there
  });

  it("when the owner changed the name or description after the screen loaded, the member is told so and the latest is loaded (no false 'only owners' blame)", async () => {
    await atBrain("member");
    await typeAudience("Collectors");
    handlers["PUT /customer/workspace/brand-brain"] = () => { stored = brainFor("Maison Aurelle Paris", DESCRIPTION, { audience: { summary: "Gift buyers." }, commercial: { primary_cta: "Shop the new scent" } }); return forbidden(); };
    fireEvent.click(button(/save who it serves and customer action/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/changed by the workspace owner after this screen loaded/i);
    expect(alert).toHaveTextContent(/latest version has been loaded/i);
    expect(await screen.findByText("Maison Aurelle Paris")).toBeInTheDocument();
  });

  it("a conflict (409) reloads the stored Brand Brain, keeps the typed answers, and does not resend a stale document", async () => {
    await atBrain("member");
    await typeAudience("Collectors");
    handlers["PUT /customer/workspace/brand-brain"] = () => { stored = brainFor("Maison Aurelle", DESCRIPTION, { audience: { summary: "Changed elsewhere." }, commercial: { primary_cta: "Shop the new scent" } }); return conflict(); };
    const reads = called("GET", "/brand-brain").length;
    fireEvent.click(button(/save who it serves and customer action/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/changed somewhere else/i);
    expect(alert).toHaveTextContent(/nothing was overwritten/i);
    expect(alert).toHaveTextContent(/your typed answers are still here/i);
    await waitFor(() => expect(called("GET", "/brand-brain").length).toBeGreaterThan(reads));
    expect(await screen.findByText("Changed elsewhere.")).toBeInTheDocument();
    expect(brainPuts()).toHaveLength(1); // no automatic retry
    goBack(2); await heading(stageHeadings[3]);
    expect(screen.getByLabelText(/who are your customers/i)).toHaveValue("Collectors");
  });

  it("a 503 or a dropped connection is 'not confirmed', never 'not saved', and 'Check what was saved' re-reads the Brand Brain", async () => {
    await atBrain("owner");
    await typeAudience("Collectors");
    for (const failing of [() => fail(503, { status: "failed", error: { code: "BRAND_BRAIN_PERSISTENCE_UNAVAILABLE" } }), () => { throw new TypeError("offline"); }]) {
      handlers["PUT /customer/workspace/brand-brain"] = failing;
      fireEvent.click(button(/^save to brand brain$/i));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/save not confirmed — your changes may already have been saved/i);
      expect(alert.textContent).not.toMatch(/not saved/i);
      const reads = called("GET", "/brand-brain").length;
      fireEvent.click(within(alert).getByRole("button", { name: /check what was saved/i }));
      await waitFor(() => expect(called("GET", "/brand-brain").length).toBeGreaterThan(reads));
    }
  });

  it("with an unknown role nothing is guessed: the server decides, and a refusal re-reads the role", async () => {
    await atBrain(null); // the workspace list is not available, so the role is unknown
    await typeAudience("Collectors");
    expect(button(/^save to brand brain$/i)).toBeEnabled();
    handlers["PUT /customer/workspace/brand-brain"] = forbidden;
    const roleReads = called("GET", "/customer/workspace").length;
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/only the workspace owner can change the business name and description, and anyone whose access/i);
    await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(roleReads));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// BG-STUDIO-015-FE: Brand Brain data integrity under change. The backend has NO compare-and-set for Brand Brain writes
// (bizgenie-api #214, Q6): a whole-document PUT built from a stale screen silently overwrites other people's later edits.
// The client therefore reads the latest stored Brand Brain just before each write and sends only the fields the customer
// edited. These tests use the shapes in #214's code and report. The API is MOCKED: this is not live proof.
// ---------------------------------------------------------------------------------------------------------------
describe("Brand Brain integrity under change (BG-STUDIO-015)", () => {
  const forbidden = () => fail(403, { status: "failed", error: { code: "BRAND_BRAIN_WRITE_FORBIDDEN", message: "Current workspace-owner authority is required for business identity changes" } });
  const base = (over = {}) => brainFor("Maison Aurelle", "A small-batch perfume house.", { audience: { summary: "Gift buyers." }, commercial: { primary_cta: "Shop the new scent" }, ...over });
  let stored; let role;
  const open = async (r = "owner", initial = base()) => {
    stored = initial; role = r;
    use(fakeServer(IN_PROGRESS({ sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, current_step: 5 })));
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: stored });
    handlers["GET /customer/workspace"] = () => (role ? ok({ status: "ready", workspace: WORKSPACE_ROW(role) }) : fail(404));
    handlers["PUT /customer/workspace/brand-brain"] = (_u, o) => { stored = { ...JSON.parse(o.body), brand_id: "brand-a", project_id: "project-a", metadata: { version: stored.metadata.version + 1, status: "draft" } }; return ok({ status: "ready", brand_brain: stored }); };
    render(<App />);
    await heading(stageHeadings[5]);
    if (r) await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(0));
  };
  const puts = () => called("PUT", "/brand-brain");
  const lastBody = () => JSON.parse(puts().pop().options.body);
  const back = (n) => { for (let i = 0; i < n; i++) fireEvent.click(button(/^back$/i)); };
  const forward = async (n) => { for (let i = 0; i < n; i++) fireEvent.click(button(/^continue$/i)); await heading(stageHeadings[5]); };
  const edit = async (label, value, stepsBack) => { back(stepsBack); await screen.findByLabelText(label); fireEvent.change(screen.getByLabelText(label), { target: { value } }); await forward(stepsBack); };
  const editCta = (v) => edit(/what should a customer do next/i, v, 3);
  const editAudience = (v) => edit(/who are your customers/i, v, 2);

  it("D1 lost update: an edit is applied to the LATEST stored Brand Brain, not to the copy loaded when the screen opened", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    stored = base({ audience: { summary: "Changed by a colleague meanwhile." } }); // someone else saved after this screen loaded
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByText(/saved to your brand brain/i)).toBeInTheDocument();
    const body = lastBody();
    expect(body.commercial.primary_cta).toBe("Book a discovery set");
    expect(body.audience.summary).toBe("Changed by a colleague meanwhile."); // NOT the stale "Gift buyers."
  });

  it("D1b an owner who edits only one field does not overwrite another owner's later name or description change", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    stored = base({ name: "Maison Aurelle Paris" });
    stored = { ...stored, identity: { description: "Rewritten by the other owner." } };
    fireEvent.click(button(/^save to brand brain$/i));
    await screen.findByText(/saved to your brand brain/i);
    const body = lastBody();
    expect(body.name).toBe("Maison Aurelle Paris");
    expect(body.identity.description).toBe("Rewritten by the other owner.");
  });

  it("nothing is sent when nothing was edited, and an untouched screen never re-sends what it prefilled", async () => {
    await open("owner");
    expect(button(/^save to brand brain$/i)).toBeDisabled(); // nothing edited: no button to press, and the reason is written next to it
    expect(screen.getByText(/nothing new to save here/i)).toBeInTheDocument();
    fireEvent.click(button(/^save to brand brain$/i));
    expect(puts()).toHaveLength(0);
  });

  it("if the latest saved Brand Brain cannot be read, nothing is written", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    const real = handlers["GET /customer/workspace/brand-brain"];
    handlers["GET /customer/workspace/brand-brain"] = () => fail(503);
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be checked, so nothing was saved/i);
    expect(puts()).toHaveLength(0);
    handlers["GET /customer/workspace/brand-brain"] = real;
  });

  it("D2 membership revoked before Save: the workspace is reported unavailable (400 trusted_scope), nothing is written, the role is re-read", async () => {
    await open("member");
    await editAudience("Collectors");
    handlers["GET /customer/workspace/brand-brain"] = () => fail(400, { status: "failed", error: { code: "WORKSPACE_VALIDATION_ERROR", message: "x", details: [{ path: "trusted_scope", code: "unauthorized", message: "Workspace selection is not authorized" }] } });
    const reads = called("GET", "/customer/workspace").length;
    fireEvent.click(button(/save who it serves and customer action/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not available to your account right now/i);
    expect(alert).toHaveTextContent(/nothing was saved/i);
    expect(puts()).toHaveLength(0);
    await waitFor(() => expect(called("GET", "/customer/workspace").length).toBeGreaterThan(reads));
  });

  it("D3 owner demoted while editing: the refused save re-reads the role and the screen becomes owner-only without losing the typed answers", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    role = "member"; // demoted after the page loaded
    handlers["PUT /customer/workspace/brand-brain"] = forbidden;
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/only the workspace owner can change the business name and description/i);
    await screen.findByText(/only the workspace owner can change the business name and description/i, { selector: ".ps-readonly" });
    expect(await screen.findByRole("button", { name: /save who it serves and customer action/i })).toBeEnabled();
    back(3);
    expect(await screen.findByLabelText(/what should a customer do next/i)).toHaveValue("Book a discovery set");
  });

  it("D4 an untouched field follows a newer stored value after a re-read, while a field the customer typed stays as typed", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    handlers["PUT /customer/workspace/brand-brain"] = () => { stored = base({ audience: { summary: "Newer audience." } }); return fail(409, { status: "failed", error: { code: "BRAND_BRAIN_VERSION_CONFLICT", message: "Brand Brain changed; reload before saving" } }); };
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nothing was overwritten/i);
    back(2);
    await waitFor(() => expect(screen.getByLabelText(/who are your customers/i)).toHaveValue("Newer audience.")); // untouched: follows the stored value
    fireEvent.click(button(/^continue$/i)); fireEvent.click(button(/^back$/i));
    back(1);
    expect(await screen.findByLabelText(/what should a customer do next/i)).toHaveValue("Book a discovery set"); // typed: kept
  });

  it("D5 a legacy stored name or description with spaces at its edges can never be repeated by a member (#214 Q1), so the member is told and nothing is sent", async () => {
    await open("member", base({ identity: { description: "A small-batch perfume house.  " } }));
    await editAudience("Collectors");
    fireEvent.click(button(/save who it serves and customer action/i));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/extra spaces/i);
    expect(alert).toHaveTextContent(/only the workspace owner can correct it/i);
    expect(puts()).toHaveLength(0);
  });

  it("D6 two overlapping Save presses send exactly one write", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    let release; handlers["PUT /customer/workspace/brand-brain"] = (_u, o) => new Promise((resolve) => { release = () => resolve(ok({ status: "ready", brand_brain: { ...JSON.parse(o.body), brand_id: "brand-a", project_id: "project-a", metadata: { version: 2, status: "draft" } } })); });
    const save = button(/^save to brand brain$/i);
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(puts()).toHaveLength(1));
    await act(async () => { release(); });
    expect(await screen.findByText(/saved to your brand brain/i)).toBeInTheDocument();
    expect(puts()).toHaveLength(1);
  });

  it("D7 the account changes while a save is in flight: the late answer is ignored and the new account shows only its own Brand Brain", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    let release; handlers["PUT /customer/workspace/brand-brain"] = (_u, o) => new Promise((resolve) => { release = () => resolve(ok({ status: "ready", brand_brain: { ...JSON.parse(o.body), brand_id: "brand-a", project_id: "project-a", metadata: { version: 2, status: "draft" } } })); });
    fireEvent.click(button(/^save to brand brain$/i));
    await waitFor(() => expect(puts()).toHaveLength(1));
    getCustomerSessionMock.mockResolvedValue(SESSION_B);
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Brookside Aesthetics", "An aesthetics clinic.") });
    handlers["GET /customer/workspace/onboarding"] = () => onboardingResponse(onboardingDoc());
    await act(async () => { await authListener(); });
    await screen.findByRole("heading", { name: "Welcome back, Brookside Aesthetics." });
    await act(async () => { release(); });
    expect(document.body.textContent).not.toMatch(/Maison Aurelle|discovery set|Saved to your Brand Brain/);
  });

  it("D8 a 200 answer that carries no Brand Brain, or is not JSON, is 'not confirmed' and never a success", async () => {
    await open("owner");
    await editCta("Book a discovery set");
    for (const answer of [() => ok({ status: "ready" }), () => ({ ok: true, status: 200, headers: new Headers(), json: async () => { throw new SyntaxError("Unexpected token"); } })]) {
      handlers["PUT /customer/workspace/brand-brain"] = answer;
      fireEvent.click(button(/^save to brand brain$/i));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/save not confirmed/i);
      expect(screen.queryByText(/^saved to your brand brain/i)).toBeNull();
      fireEvent.click(within(alert).getByRole("button", { name: /check what was saved/i }));
    }
  });

  it("D9 an unexpected 403 after an earlier successful read is a refusal, never a load failure: the Brand Brain stays on screen", async () => {
    await open("owner");
    fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
    const name = await screen.findByLabelText(/^business name$/i);
    fireEvent.change(await screen.findByLabelText(/who it serves/i), { target: { value: "Collectors" } });
    handlers["PUT /customer/workspace/brand-brain"] = forbidden;
    fireEvent.click(button(/^save to brand brain$/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/saving was refused/i);
    expect(name).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(screen.getByLabelText(/who it serves/i)).toHaveValue("Collectors");
  });

  it("the Brand tab is owner-only for the name and description, and a member can still change the rest", async () => {
    await open("member");
    fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
    expect(await screen.findByLabelText(/^business name$/i)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/what the business does/i)).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText(/what a customer should do next|what should a customer do next/i), { target: { value: "Request a sample" } });
    fireEvent.click(screen.getByRole("button", { name: /save who it serves and customer action/i }));
    expect(await screen.findByText(/business name and description are unchanged/i)).toBeInTheDocument();
    const body = lastBody();
    expect(body.name).toBe("Maison Aurelle");
    expect(body.commercial.primary_cta).toBe("Request a sample");
  });

  it("voice and strategy details save through the same read-latest path: a member's save repeats the stored name and description exactly and keeps every other field (BG-STUDIO-018-FE)", async () => {
    await open("member");
    fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
    fireEvent.change(await screen.findByLabelText(/^tone of voice$/i), { target: { value: "Warm and direct" } });
    fireEvent.change(screen.getByLabelText(/^values$/i), { target: { value: "Honest\nLocal" } });
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(await screen.findByText(/only the details you changed here were sent/i)).toBeInTheDocument();
    const body = lastBody();
    expect(body.name).toBe("Maison Aurelle");
    expect(body.identity.description).toBe("A small-batch perfume house."); // the stored description, repeated exactly
    expect(body.audience.summary).toBe("Gift buyers."); expect(body.commercial.primary_cta).toBe("Shop the new scent"); // untouched fields kept
    expect(body.voice).toEqual({ tone: "Warm and direct" });
    expect(body.identity.values).toEqual(["Honest", "Local"]);
    for (const key of ["brand_id", "project_id", "metadata"]) expect(body).not.toHaveProperty(key);
    expect(called("GET", "/brand-brain").length).toBeGreaterThanOrEqual(2); // the latest stored version was read before the write
  });

  it("a refused (403) voice and strategy save keeps what was typed and says nothing was saved", async () => {
    await open("owner");
    fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
    handlers["PUT /customer/workspace/brand-brain"] = () => fail(403, { status: "failed", error: { code: "BRAND_BRAIN_WRITE_FORBIDDEN" } });
    fireEvent.change(await screen.findByLabelText(/^mission$/i), { target: { value: "Keep businesses moving" } });
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(await screen.findByText(/nothing was saved/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^mission$/i)).toHaveValue("Keep businesses moving");
    expect(screen.queryByText(/only the details you changed here were sent/i)).toBeNull();
  });

  it("D10 refreshing the page with unsaved Brand Brain edits warns first", async () => {
    await open("owner");
    fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
    fireEvent.change(await screen.findByLabelText(/who it serves/i), { target: { value: "Collectors" } });
    const probe = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(probe);
    expect(probe.defaultPrevented).toBe(true);
  });
});

describe("unexpected but valid JSON from the API (BG-STUDIO-015)", () => {
  const shapes = {
    "a name that is a number": { name: 12345, metadata: { version: 1, status: "approved" } },
    "an identity that is a string": { name: "N", identity: "text", metadata: { version: 1, status: "approved" } },
    "sections that are arrays or strings": { name: "N", audience: ["a"], commercial: "x", metadata: { version: 1, status: "approved" } },
    "no metadata at all": { name: "N" },
    "a description that is an object": { name: "N", identity: { description: { a: 1 } }, metadata: {} },
  };
  for (const [label, shape] of Object.entries(shapes)) {
    it(`${label} never blanks the Studio or the Brand tab, and offers no save that would send a made-up change`, async () => {
      handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: { brand_id: "brand-a", project_id: "project-a", ...shape } });
      render(<App />);
      await screen.findByRole("navigation", { name: /workspace sections/i });
      fireEvent.click(screen.getByRole("button", { name: /^brand$/i }));
      expect(await screen.findByRole("heading", { name: /^brand brain$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save to brand brain/i })).toBeDisabled(); // nothing edited, so nothing to send
      expect(called("PUT", "/brand-brain")).toHaveLength(0);
    });
  }
});

describe("the business profile tile never says 'Complete' while details are missing (BG-STUDIO-015)", () => {
  it("shows 'Confirmed' with the missing count when setup was confirmed but details are still not provided", async () => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor("Harbour Partners", "Business consulting.") });
    render(<App />);
    const tiles = await screen.findByRole("region", { name: /^status$/i });
    expect(within(tiles).getByText("Confirmed")).toBeInTheDocument();
    expect(within(tiles).queryByText("Complete")).toBeNull();
    expect(tiles).toHaveTextContent(/setup confirmed by you\. 2 details are still not provided/i);
  });
  it("shows 'Complete' only when nothing is missing", async () => {
    render(<App />); // NORTHGATE has a name, description, audience and customer action
    const tiles = await screen.findByRole("region", { name: /^status$/i });
    expect(within(tiles).getByText("Complete")).toBeInTheDocument();
    expect(within(tiles).queryByText("Confirmed")).toBeNull();
  });
});

describe("an ended session offers 'Sign in again', not retry buttons that cannot work (BG-STUDIO-017-FE)", () => {
  const authRefused = () => fail(401, { status: "failed", error: { code: "AUTHENTICATION_REQUIRED" } });

  it("shows a session-ended notice with a working 'Sign in again' when the Brand Brain and setup are refused with 401", async () => {
    handlers["GET /customer/workspace/brand-brain"] = authRefused;
    handlers["GET /customer/workspace/onboarding"] = authRefused;
    render(<App />);
    const alert = await screen.findByText(/your session has ended\.$/i, { selector: "strong" });
    const banner = alert.closest("[role='status']");
    expect(banner).toHaveTextContent(/sign in again to continue/i);
    expect(banner).toHaveTextContent(/typed but not saved .* may be lost/i);
    const { signOut } = await import("../authClient");
    fireEvent.click(within(banner).getByRole("button", { name: /^sign in again$/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("does not claim the session ended for a temporary outage (503)", async () => {
    handlers["GET /customer/workspace/brand-brain"] = () => fail(503, { status: "failed", error: { code: "BRAND_BRAIN_UNAVAILABLE" } });
    render(<App />);
    await screen.findByText(/your brand brain could not be loaded/i);
    expect(screen.queryByRole("button", { name: /^sign in again$/i })).toBeNull();
  });

  it("clears the notice once a retry succeeds", async () => {
    let refused = true;
    handlers["GET /customer/workspace/brand-brain"] = () => (refused ? authRefused() : ok({ status: "ready", brand_brain: NORTHGATE }));
    handlers["GET /customer/workspace/onboarding"] = () => (refused ? authRefused() : onboardingResponse(onboardingDoc()));
    render(<App />);
    await screen.findByRole("button", { name: /^sign in again$/i });
    refused = false;
    for (const retry of screen.getAllByRole("button", { name: /^try again$/i })) fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^sign in again$/i })).toBeNull());
  });
});

describe("the campaign calendar loads by itself and states its window (DEC-023, BG-STUDIO-017-FE)", () => {
  const calendarCalls = () => calls.filter((c) => c.method === "GET" && /\/calendar$/.test(c.path));
  async function toCalendarWithCampaign() {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Get more lease enquiries" } });
    for (let i = 0; i < 3; i++) fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /your first recommendation/i });
    fireEvent.click(button(/get my recommendation/i));
    await screen.findByRole("heading", { name: "Lease Enquiry Campaign" });
    fireEvent.click(button(/continue in campaign studio/i));
    fireEvent.click(await screen.findByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Calendar" }));
    fireEvent.click(await screen.findByRole("button", { name: /^this campaign/i })); // the campaign-level view stays available and labelled
  }

  it("requests the calendar once on opening it, states the window and the campaign-only scope, and never implies workspace-wide coverage", async () => {
    handlers["GET /customer/campaigns/*/calendar"] = () => ok({ entries: [{ campaign_id: CID, variant_id: "v1", content_item_id: "c1", workflow: "scheduled", occurrence_at: "2026-11-02T10:00:00.000Z" }] });
    await toCalendarWithCampaign();
    expect(await screen.findByText(/showing activity from .* to .* \(the last 30 days and the next 90 days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/lease enquiry campaign/i, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/only\. a calendar across all your campaigns is not available yet/i)).toBeInTheDocument();
    expect(screen.getByText(/scheduled/i, { selector: "strong" })).toBeInTheDocument();
    expect(calendarCalls()).toHaveLength(1);
    const url = new URL(calendarCalls()[0].url);
    const days = (new Date(url.searchParams.get("to")) - new Date(url.searchParams.get("from"))) / 86400000;
    expect(Math.round(days)).toBe(120);
    expect(screen.queryByText(/all your (campaigns|content)/i, { selector: "h2, h3, strong" })).toBeNull();
  });

  it("an empty calendar says so for this period; Refresh asks again only when pressed", async () => {
    handlers["GET /customer/campaigns/*/calendar"] = () => ok({ entries: [] });
    await toCalendarWithCampaign();
    expect(await screen.findByText(/no scheduled or published activity is recorded for this campaign in this period/i)).toBeInTheDocument();
    expect(calendarCalls()).toHaveLength(1);
    fireEvent.click(button(/^refresh$/i));
    await waitFor(() => expect(calendarCalls()).toHaveLength(2));
  });

  it("a failed load is not retried in a loop: it shows the error and a 'Try again' button", async () => {
    handlers["GET /customer/campaigns/*/calendar"] = () => fail(503);
    await toCalendarWithCampaign();
    expect(await screen.findByRole("alert")).toHaveTextContent(/calendar activity could not be loaded yet/i);
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    expect(calendarCalls()).toHaveLength(1);
    handlers["GET /customer/campaigns/*/calendar"] = () => ok({ entries: [] });
    fireEvent.click(button(/^try again$/i));
    await screen.findByText(/no scheduled or published activity/i);
    expect(calendarCalls()).toHaveLength(2);
  });

});

describe("the workspace calendar inside the Premium Studio (BG-STUDIO-018-FE, DEC-025)", () => {
  const CAMP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const listed = () => ok({ campaigns: [{ campaign_id: CAMP, name: "Spring leasing", status: "active", archived_at: null, updated_at: "2026-10-20T09:00:00.000Z" }] });
  const docOf = () => ok({ campaign: { campaign_id: CAMP, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", name: "Spring leasing", goal: "g", display_timezone: "Europe/London", version: 2, items: [
    { content_item_id: "i1", name: "Offer announcement", format: "text", variants: [{ variant_id: "v1", platform: "instagram", placement: "feed", destination_label: "Instagram", workflow: "scheduled" }, { variant_id: "v2", platform: "email", placement: "newsletter", destination_label: "Email", workflow: "draft" }] }] } });
  const calendarOf = () => { const t = new Date(); t.setUTCDate(t.getUTCDate() + 1); t.setUTCHours(10, 0, 0, 0); return ok({ entries: [{ campaign_id: CAMP, content_item_id: "i1", variant_id: "v1", workflow: "scheduled", occurrence_at: t.toISOString() }] }); };
  const openCalendar = async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Calendar" }));
  };

  it("opens on all campaigns, loads once by itself with the explicit window, and shows real content, channel and status", async () => {
    handlers["GET /customer/campaigns"] = listed; handlers[`GET /customer/campaigns/${CAMP}`] = docOf; handlers[`GET /customer/campaigns/${CAMP}/calendar`] = calendarOf;
    await openCalendar();
    expect(await screen.findByRole("heading", { name: /calendar · all campaigns/i })).toBeInTheDocument();
    expect(await screen.findByText(/read 1 of 1 campaign for/i)).toBeInTheDocument();
    expect(screen.getAllByText(/offer announcement/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/spring leasing · instagram · feed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not yet scheduled \(1\)/i)).toBeInTheDocument();
    const cal = calls.filter((c) => /\/calendar$/.test(c.path));
    expect(cal).toHaveLength(1);
    const q = new URL(cal[0].url).searchParams;
    expect(q.get("tenant_id")).toBe("tenant-a"); expect(q.get("project_id")).toBe("project-a");
    expect(Date.parse(q.get("from"))).toBeLessThan(Date.parse(q.get("to")));
    expect(calls.every((c) => c.method === "GET" || !c.path.includes("/calendar"))).toBe(true);
  });

  it("keeps the campaign-level calendar available and labelled alongside it", async () => {
    handlers["GET /customer/campaigns"] = listed; handlers[`GET /customer/campaigns/${CAMP}`] = docOf; handlers[`GET /customer/campaigns/${CAMP}/calendar`] = calendarOf;
    await openCalendar();
    await screen.findByText(/read 1 of 1 campaign/i);
    fireEvent.click(screen.getByRole("button", { name: /^this campaign/i }));
    expect(screen.getByRole("heading", { name: /calendar · this campaign/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^all campaigns$/i }));
    expect(screen.getByRole("heading", { name: /calendar · all campaigns/i })).toBeInTheDocument();
  });

  it("an ended session is reported once, with 'Sign in again', not as an empty calendar", async () => {
    handlers["GET /customer/campaigns"] = () => fail(401, { error: { code: "AUTHENTICATION_REQUIRED" } });
    await openCalendar();
    expect(await screen.findByRole("button", { name: /^sign in again$/i })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended|could not be loaded/i);
    expect(screen.queryByText(/no scheduled or published activity/i)).toBeNull();
  });

  it("a campaign that cannot be read is named, and the others are still shown", async () => {
    handlers["GET /customer/campaigns"] = listed; handlers[`GET /customer/campaigns/${CAMP}`] = docOf; handlers[`GET /customer/campaigns/${CAMP}/calendar`] = () => fail(500);
    await openCalendar();
    expect(await screen.findByText(/could not read: spring leasing/i)).toBeInTheDocument();
    expect(screen.getByText(/read 0 of 1 campaign/i)).toBeInTheDocument();
  });

});

describe("scheduling an approved item records a plan and never publishes (BG-STUDIO-018-FE)", () => {
  const scheduledDoc = (at, tz = "Europe/London") => { const d = campaignDoc(7, 1, "scheduled"); d.items[0].variants[0].active_schedule_id = "schedule-1"; d.schedules = [{ schedule_id: "schedule-1", scheduled_for: at, timezone: tz }]; return d; };
  async function toApproved() {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Get more lease enquiries" } });
    for (let i = 0; i < 3; i++) fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /your first recommendation/i });
    fireEvent.click(button(/get my recommendation/i));
    await screen.findByRole("heading", { name: "Lease Enquiry Campaign" });
    fireEvent.click(button(/continue in campaign studio/i));
    fireEvent.click(await screen.findByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");
    fireEvent.click(await screen.findByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
  }
  const schedulePosts = () => calls.filter((c) => c.method === "POST" && /\/(schedule|reschedule)$/.test(c.path));

  it("offers a planned time for approved content, sends exactly the fields the backend validates, and then shows the plan", async () => {
    handlers["POST /customer/campaigns/*/variants/*/schedule"] = () => ok({ result: { campaign_id: CID }, campaign: scheduledDoc("2099-01-15T10:00:00.000Z") });
    await toApproved();
    expect(screen.getByText(/this records the time you plan to publish\. it does not post anything or remind you/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/plan when to publish \(europe\/london\)/i), { target: { value: "2099-01-15T10:00" } });
    fireEvent.click(button(/save planned time/i));
    expect(await screen.findByText(/scheduled for .*15 january 2099 at 10:00 \(europe\/london\)/i)).toBeInTheDocument();
    const [post] = schedulePosts();
    const body = JSON.parse(post.options.body);
    expect(body).toMatchObject({ tenant_id: "tenant-a", project_id: "project-a", expected_campaign_version: 6, revision_id: "revision-1", scheduled_for: "2099-01-15T10:00:00.000Z", timezone: "Europe/London", local_datetime: "2099-01-15T10:00:00.000", utc_offset_minutes: 0 });
    expect(body.idempotency_key).toMatch(/^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:-]*$/);
    expect(post.options.headers.authorization).toBe("Bearer token-a");
    expect(screen.getByText(/does not publish for you/i)).toBeInTheDocument();
    expect(screen.queryByText(/published by customer attestation/i)).toBeNull(); // scheduling is never shown as publication
    expect(calls.some((c) => /manual-publication/.test(c.path))).toBe(false);
    expect(screen.getByRole("button", { name: /prepare manual publication/i })).toBeInTheDocument(); // manual publication stays possible
  });

  it("a time in the past is refused in words before anything is sent", async () => {
    await toApproved();
    fireEvent.change(screen.getByLabelText(/plan when to publish/i), { target: { value: "2020-01-15T10:00" } });
    fireEvent.click(button(/save planned time/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose a time in the future/i);
    expect(schedulePosts()).toHaveLength(0);
  });

  it("a refused schedule says nothing was published and keeps the approval; a stale campaign tells the customer to reload", async () => {
    handlers["POST /customer/campaigns/*/variants/*/schedule"] = () => fail(409, { error: { code: "CAMPAIGN_VERSION_CONFLICT" } });
    await toApproved();
    fireEvent.change(screen.getByLabelText(/plan when to publish/i), { target: { value: "2099-01-15T10:00" } });
    fireEvent.click(button(/save planned time/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/./);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.queryByText(/planned time saved/i)).toBeNull();
    expect(schedulePosts()).toHaveLength(1); // no automatic retry
  });

  it("an ended session during a schedule is reported as such, with 'Sign in again'", async () => {
    handlers["POST /customer/campaigns/*/variants/*/schedule"] = () => fail(401, { error: { code: "AUTHENTICATION_REQUIRED" } });
    await toApproved();
    fireEvent.change(screen.getByLabelText(/plan when to publish/i), { target: { value: "2099-01-15T10:00" } });
    fireEvent.click(button(/save planned time/i));
    expect(await screen.findByRole("button", { name: /^sign in again$/i })).toBeInTheDocument();
  });
});

describe("campaign management in the Premium Studio (BG-STUDIO-019-FE, workstream E)", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let server;
  const detail = (id) => ({ campaign_id: id, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", name: server[id].name, goal: "g", display_timezone: "Europe/London", version: server[id].version, archived_at: server[id].archived_at, items: [], schedules: [], publications: [] });
  const summary = (id) => ({ campaign_id: id, name: server[id].name, status: "active", archived_at: server[id].archived_at, updated_at: server[id].updated });
  const patchCalls = () => calls.filter((c) => c.method === "PATCH");
  const posts = (suffix) => calls.filter((c) => c.method === "POST" && c.path.endsWith(suffix));
  function serve(extra = {}) {
    server = { [A]: { name: "Spring leasing", version: 4, archived_at: null, updated: "2026-10-20T09:00:00.000Z" }, [B]: { name: "Old promotion", version: 9, archived_at: "2026-09-01T09:00:00.000Z", updated: "2026-09-01T09:00:00.000Z" } };
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [summary(A), summary(B)] });
    handlers[`GET /customer/campaigns/${A}`] = () => ok({ campaign: detail(A) });
    handlers[`GET /customer/campaigns/${B}`] = () => ok({ campaign: detail(B) });
    handlers[`PATCH /customer/campaigns/${A}`] = (_u, o) => { const b = JSON.parse(o.body); server[A].name = b.name; server[A].version += 1; return ok({ result: {}, campaign: detail(A) }); };
    handlers[`POST /customer/campaigns/${A}/archive`] = () => { server[A].archived_at = "2026-10-26T09:00:00.000Z"; server[A].version += 1; return ok({ result: {}, campaign: detail(A) }); };
    handlers[`POST /customer/campaigns/${B}/restore`] = () => { server[B].archived_at = null; server[B].version += 1; return ok({ result: {}, campaign: detail(B) }); };
    Object.assign(handlers, extra);
  }
  const openTab = async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Campaigns" }));
    await screen.findByRole("heading", { name: "Campaigns" });
  };

  it("lists active campaigns, keeps archived ones out of sight until asked, and offers only what applies to each", async () => {
    serve(); await openTab();
    expect(await screen.findByText("Spring leasing")).toBeInTheDocument();
    expect(screen.queryByText("Old promotion")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show archived campaigns \(1\)/i }));
    const archived = screen.getByRole("list", { name: /archived campaigns/i });
    expect(within(archived).getByText("Old promotion")).toBeInTheDocument();
    expect(within(archived).getByRole("button", { name: /restore old promotion/i })).toBeInTheDocument();
    expect(within(archived).queryByRole("button", { name: /rename|open/i })).toBeNull(); // an archived campaign cannot be opened or renamed
  });

  it("renames against the LATEST version and timezone, then shows the new name in the list", async () => {
    serve(); await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /rename spring leasing/i }));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "  Autumn leasing  " } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    expect(await screen.findByText(/renamed to autumn leasing/i)).toBeInTheDocument();
    expect(screen.getByText("Autumn leasing")).toBeInTheDocument();
    const body = JSON.parse(patchCalls()[0].options.body);
    expect(body).toMatchObject({ tenant_id: "tenant-a", project_id: "project-a", name: "Autumn leasing", expected_campaign_version: 4, display_timezone: "Europe/London" });
    expect(calls.findIndex((c) => c.method === "GET" && c.path === `/customer/campaigns/${A}`)).toBeLessThan(calls.findIndex((c) => c.method === "PATCH")); // read first
  });

  it("archiving asks why, explains that nothing is deleted, sends the reason, and removes the campaign from the list", async () => {
    serve(); await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /archive spring leasing/i }));
    expect(screen.getByText(/nothing is deleted/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^archive campaign$/i })).toBeDisabled(); // a reason is required
    fireEvent.change(screen.getByLabelText(/why are you archiving it/i), { target: { value: "Season over" } });
    fireEvent.click(screen.getByRole("button", { name: /^archive campaign$/i }));
    expect(await screen.findByText(/archived spring leasing\. it is hidden from your campaigns and calendar, not deleted/i)).toBeInTheDocument();
    expect(JSON.parse(posts("/archive")[0].options.body)).toMatchObject({ reason: "Season over", expected_campaign_version: 4 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^rename spring leasing$/i })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /show archived campaigns \(2\)/i }));
    expect(screen.getByRole("button", { name: /restore spring leasing/i })).toBeInTheDocument();
  });

  it("restoring an archived campaign returns it to the list", async () => {
    serve(); await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /show archived campaigns/i }));
    fireEvent.click(screen.getByRole("button", { name: /restore old promotion/i }));
    fireEvent.change(screen.getByLabelText(/why are you restoring it/i), { target: { value: "Running it again" } });
    fireEvent.click(screen.getByRole("button", { name: /^restore campaign$/i }));
    expect(await screen.findByText(/restored old promotion/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /rename old promotion/i })).toBeInTheDocument());
  });

  it("a campaign with something scheduled cannot be archived: the backend's refusal is explained and nothing changes", async () => {
    serve({ [`POST /customer/campaigns/${A}/archive`]: () => fail(409, { error: { code: "INVALID_TRANSITION" } }) });
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /archive spring leasing/i }));
    fireEvent.change(screen.getByLabelText(/why are you archiving it/i), { target: { value: "Season over" } });
    fireEvent.click(screen.getByRole("button", { name: /^archive campaign$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not possible in the campaign's current state/i);
    expect(screen.getByText("Spring leasing")).toBeInTheDocument();
    expect(posts("/archive")).toHaveLength(1);
  });

  it("a campaign that changed elsewhere (409 version) reloads the truth and does not overwrite", async () => {
    serve({ [`PATCH /customer/campaigns/${A}`]: () => fail(409, { error: { code: "VERSION_CONFLICT" } }) });
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /rename spring leasing/i }));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed somewhere else, so nothing was changed/i);
    expect(patchCalls()).toHaveLength(1);
    expect(screen.queryByText("Mine", { selector: "strong" })).toBeNull();
  });

  it("a campaign that is gone or no longer yours (404) says so and refreshes the list", async () => {
    let reads = 0; // the first read is the automatic restore of the newest campaign; later reads find it gone
    serve({ [`GET /customer/campaigns/${A}`]: () => (++reads === 1 ? ok({ campaign: detail(A) }) : fail(404, { error: { code: "RESOURCE_NOT_AVAILABLE" } })) });
    await openTab();
    const before = calls.filter((c) => c.method === "GET" && c.path === "/customer/campaigns").length;
    fireEvent.click(await screen.findByRole("button", { name: /rename spring leasing/i }));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not available to you any more/i);
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === "/customer/campaigns").length).toBeGreaterThan(before));
    expect(patchCalls()).toHaveLength(0);
  });

  it("an ended session during a management action offers 'Sign in again'", async () => {
    serve({ [`PATCH /customer/campaigns/${A}`]: () => fail(401, { error: { code: "AUTHENTICATION_REQUIRED" } }) });
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /rename spring leasing/i }));
    fireEvent.change(screen.getByLabelText("Campaign name"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    expect(await screen.findByRole("button", { name: /^sign in again$/i })).toBeInTheDocument();
  });

  it("opening a campaign loads it into Campaign Studio and clears the previous campaign's calendar and review state", async () => {
    serve(); await openTab();
    fireEvent.click(await screen.findByRole("button", { name: /open spring leasing in campaign studio/i }));
    expect(await screen.findByText(/saved to your workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Spring leasing" })).toBeInTheDocument();
  });
});

describe("recording how a manual publication went (BG-STUDIO-019-FE, workstream E)", () => {
  const ATTEMPT = "99999999-9999-4999-8999-999999999999";
  const withPending = (doc) => { doc.items[0].variants[0].pending_attempt_id = ATTEMPT; return doc; };
  const published = () => { const d = campaignDoc(9, 1, "published"); d.items[0].variants[0].publication_id = "pub-1"; d.publications = [{ publication_id: "pub-1", published_at: "2026-10-26T09:30:00.000Z", publication_url: "https://instagram.com/p/abc", evidence_kind: "customer_attestation" }]; return d; };
  async function toPrepared() {
    handlers["POST /customer/campaigns/*/variants/*/manual-publication"] = () => ok({ result: { created_ids: { attempt_ids: [ATTEMPT] } }, campaign: withPending(campaignDoc(7, 1, "approved")) }, 201);
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(screen.getAllByRole("button", { name: /tell us your goal/i })[0]);
    fireEvent.change(await screen.findByLabelText(/what do you want a campaign to achieve/i), { target: { value: "Get more lease enquiries" } });
    for (let i = 0; i < 3; i++) fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /your first recommendation/i });
    fireEvent.click(button(/get my recommendation/i));
    await screen.findByRole("heading", { name: "Lease Enquiry Campaign" });
    fireEvent.click(button(/continue in campaign studio/i));
    fireEvent.click(await screen.findByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");
    fireEvent.click(await screen.findByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
    fireEvent.click(button(/prepare manual publication/i));
    await screen.findByRole("form", { name: /record the manual publication/i });
  }
  const resolutions = (outcome) => calls.filter((c) => c.method === "POST" && c.path.endsWith(`/manual-publication/${outcome}`));

  it("offers all three outcomes, and says plainly that nothing was published by BizGenie", async () => {
    await toPrepared();
    const form = screen.getByRole("form", { name: /record the manual publication/i });
    expect(within(form).getAllByRole("radio").map((r) => r.parentElement.textContent.trim())).toEqual(["I published it", "I tried, but it did not publish", "I am not going ahead"]);
    expect(within(form).getByText(/it does not check the platform and it does not publish anything/i)).toBeInTheDocument();
    expect(within(form).getByLabelText(/approved content/i)).toHaveAttribute("readonly");
  });

  it("'I published it' records the customer's own time and address, refuses a non-https address first, and then shows a statement, never a verification", async () => {
    handlers["POST /customer/campaigns/*/variants/*/manual-publication/confirm"] = () => ok({ result: {}, campaign: published() });
    await toPrepared();
    fireEvent.change(screen.getByLabelText(/public address of the post/i), { target: { value: "http://insecure.test/p" } });
    fireEvent.click(button(/record that i published it/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/starting https/i);
    expect(resolutions("confirm")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/public address of the post/i), { target: { value: "https://instagram.com/p/abc" } });
    fireEvent.change(screen.getByLabelText(/reference \(optional\)/i), { target: { value: "post-abc" } });
    fireEvent.change(screen.getByLabelText(/note \(optional\)/i), { target: { value: "Posted by the studio" } });
    fireEvent.click(button(/record that i published it/i));
    expect(await screen.findByText(/recorded by you as published/i)).toBeInTheDocument();
    const body = JSON.parse(resolutions("confirm")[0].options.body);
    expect(body).toMatchObject({ attempt_id: ATTEMPT, publication_url: "https://instagram.com/p/abc", external_reference: "post-abc", note: "Posted by the studio", expected_campaign_version: 7 });
    expect(Date.parse(body.published_at)).toBeLessThanOrEqual(Date.now());
    expect(screen.getByText(/has not checked the platform: this is your own statement/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/verified|bizgenie published/i);
    expect(screen.getByRole("link", { name: /open the post you recorded/i })).toHaveAttribute("href", "https://instagram.com/p/abc");
  });

  it("'did not publish' needs a reason, keeps the approval, and lets the customer prepare again", async () => {
    handlers["POST /customer/campaigns/*/variants/*/manual-publication/fail"] = () => ok({ result: {}, campaign: campaignDoc(8, 1, "approved") });
    await toPrepared();
    fireEvent.click(screen.getByLabelText("I tried, but it did not publish"));
    fireEvent.click(button(/record the failure/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/say what went wrong/i);
    expect(resolutions("fail")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/what went wrong/i), { target: { value: "The platform rejected the upload" } });
    fireEvent.click(button(/record the failure/i));
    expect(await screen.findByText(/recorded as not published\. your approval is kept/i)).toBeInTheDocument();
    expect(JSON.parse(resolutions("fail")[0].options.body)).toMatchObject({ attempt_id: ATTEMPT, reason: "The platform rejected the upload" });
    expect(screen.getByRole("button", { name: /prepare manual publication/i })).toBeInTheDocument();
    expect(screen.queryByText(/recorded by you as published/i)).toBeNull();
  });

  it("'not going ahead' closes the handoff with a reason and publishes nothing", async () => {
    handlers["POST /customer/campaigns/*/variants/*/manual-publication/cancel"] = () => ok({ result: {}, campaign: campaignDoc(8, 1, "approved") });
    await toPrepared();
    fireEvent.click(screen.getByLabelText("I am not going ahead"));
    fireEvent.change(screen.getByLabelText(/why are you not going ahead/i), { target: { value: "Changed the plan" } });
    fireEvent.click(button(/close the handoff/i));
    expect(await screen.findByText(/handoff closed\. nothing was published/i)).toBeInTheDocument();
    expect(JSON.parse(resolutions("cancel")[0].options.body).reason).toBe("Changed the plan");
  });

  it("an unconfirmed answer (503) is not shown as recorded, and the latest saved campaign is re-read", async () => {
    handlers["POST /customer/campaigns/*/variants/*/manual-publication/cancel"] = () => fail(503, { error: { code: "CAMPAIGN_TEMPORARILY_UNAVAILABLE" } });
    await toPrepared();
    const before = calls.filter((c) => c.method === "GET" && /\/customer\/campaigns\/[^/]+$/.test(c.path)).length;
    fireEvent.click(screen.getByLabelText("I am not going ahead"));
    fireEvent.change(screen.getByLabelText(/why are you not going ahead/i), { target: { value: "x" } });
    fireEvent.click(button(/close the handoff/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/may or may not have been saved/i);
    expect(screen.queryByText(/handoff closed/i)).toBeNull();
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && /\/customer\/campaigns\/[^/]+$/.test(c.path)).length).toBeGreaterThan(before));
  });

  it("a handoff that was already waiting before a reload is still there: the saved campaign, not memory, decides", async () => {
    const CAMP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: [{ campaign_id: CAMP, name: "Lease Enquiry Campaign", status: "active", archived_at: null, updated_at: "2026-10-20T09:00:00.000Z" }] });
    handlers[`GET /customer/campaigns/${CAMP}`] = () => ok({ campaign: withPending({ ...campaignDoc(7, 1, "approved"), campaign_id: CAMP }) });
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Campaign Studio" }));
    expect(await screen.findByRole("form", { name: /record the manual publication/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prepare manual publication/i })).toBeNull(); // not a second handoff
  });
});

describe("the workspace calendar never drops campaigns silently and opens them on request (BG-STUDIO-019-FE, workstream B1)", () => {
  const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const summaries = (n) => Array.from({ length: n }, (_, i) => ({ campaign_id: id(i + 1), name: `Campaign ${i + 1}`, status: "active", archived_at: null, updated_at: `2026-10-${String(10 + (i % 15)).padStart(2, "0")}T0${i % 10}:00:00.000Z` }));
  const doc = (cid, name) => ({ campaign_id: cid, tenant_id: "tenant-a", project_id: "project-a", brand_id: "brand-a", name, goal: "g", display_timezone: "Europe/London", version: 3, items: [{ content_item_id: `i-${cid}`, name: `Post for ${name}`, format: "text", variants: [{ variant_id: `v-${cid}`, platform: "instagram", placement: "feed", destination_label: "Instagram", workflow: "draft" }] }], schedules: [] });
  function serve(n) {
    const list = summaries(n);
    handlers["GET /customer/campaigns"] = () => ok({ campaigns: list });
    for (const c of list) { handlers[`GET /customer/campaigns/${c.campaign_id}`] = () => ok({ campaign: doc(c.campaign_id, c.name) }); handlers[`GET /customer/campaigns/${c.campaign_id}/calendar`] = () => ok({ entries: [] }); }
  }
  const openCalendar = async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    fireEvent.click(within(screen.getByRole("navigation", { name: /workspace sections/i })).getByRole("button", { name: "Calendar" }));
  };

  it("with more campaigns than one batch it says how many are unread, and the customer can load them all", async () => {
    serve(11); await openCalendar();
    expect(await screen.findByText(/read 8 of 11 campaigns for/i)).toBeInTheDocument();
    expect(screen.getByText(/3 more campaigns have not been read yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load the next 3 campaigns/i }));
    expect(await screen.findByText(/read 11 of 11 campaigns for/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load the next/i })).toBeNull();
    expect(screen.getByText(/not yet scheduled \(11\)/i)).toBeInTheDocument(); // every campaign's draft is there: nothing was dropped
  });

  it("opening an item's campaign from the calendar loads it into Campaign Studio", async () => {
    serve(2); await openCalendar();
    await screen.findByText(/read 2 of 2 campaigns for/i);
    fireEvent.click(screen.getAllByRole("button", { name: /open campaign campaign 2: post for campaign 2/i })[0]);
    expect(await screen.findByText(/saved to your workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campaign 2" })).toBeInTheDocument();
  });
});

