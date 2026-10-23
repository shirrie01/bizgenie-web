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
  it("shows the customer's own brand, an inferred sector, and saved facts with their source", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    expect(screen.getByText("Vehicle leasing", { selector: ".ps-chip" })).toBeInTheDocument();
    expect(screen.getByText(/inferred from what you typed/i)).toBeInTheDocument();
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
    render(<App />);
    // A placeholder name is not a real business name, so the profile is incomplete and onboarding opens, empty.
    await screen.findByRole("heading", { name: /tell us about your business/i });
    expect(screen.getByLabelText(/business name/i)).toHaveValue("");
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    await screen.findByRole("heading", { name: "Welcome to your workspace." });
    expect(document.body.textContent).not.toContain("Customer Campaign Workspace");
  });

  it.each([
    ["Maison Aurelle", "A fragrance house.", "Fragrance & perfume", ["lease", "clinic", "flavour"]],
    ["Clearskin Studio", "An aesthetics clinic in Leeds.", "Aesthetics clinic", ["lease", "fragrance", "flavour"]],
    ["Fonzo", "Soft drinks for everyone.", "Soft drinks & beverages", ["lease", "fragrance", "clinic"]],
    ["WOW Charity", "We support local families.", "Charity & community", ["lease", "fragrance", "flavour"]],
    ["Harbour Partners", "Business consulting.", "Not specified", ["lease", "fragrance", "flavour", "clinic", "donate"]],
  ])("%s gets its own sector and no other industry's wording", async (name, description, label, forbidden) => {
    handlers["GET /customer/workspace/brand-brain"] = () => ok({ status: "ready", brand_brain: brainFor(name, description) });
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
    handlers["PUT /customer/workspace/brand-brain"] = () => fail(500);
    fireEvent.click(button(/save to brand brain/i));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved yet/i);
    expect(screen.queryByText(/saved to your brand brain/i)).toBeNull();
  });

  it("sends sector and channels nowhere: they stay in this session and are labelled that way", async () => {
    await toBrainStep();
    fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i)); fireEvent.click(button(/^back$/i));
    expect(screen.getByText(/Inferred from what you typed/i)).toBeInTheDocument();
    for (const c of calls) expect(String(c.options.body || "")).not.toMatch(/Instagram|vehicle leasing/i);
  });

  it("shows session-only values as such in the workspace", async () => {
    await toBrainStep();
    fireEvent.click(button(/save to brand brain/i)); await screen.findByText(/saved to your brand brain/i);
    fireEvent.click(button(/^continue$/i));
    await screen.findByRole("heading", { name: /your first recommendation/i });
    fireEvent.click(button(/go to my workspace/i));
    await screen.findByRole("heading", { name: "Welcome back, Northgate Vehicle Leasing." });
    const facts = screen.getByRole("heading", { name: /what bizgenie knows/i }).closest("section");
    expect(within(facts).getByText("Instagram")).toBeInTheDocument();
    expect(within(facts).getByText(/no account is connected and nothing is saved/i)).toBeInTheDocument();
    expect(within(facts).getAllByText("This session").length).toBeGreaterThanOrEqual(2);
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
