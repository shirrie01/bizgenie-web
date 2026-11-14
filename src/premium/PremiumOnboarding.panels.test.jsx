// BG-WEB-ONBOARDING-MOCKUP (Issue #85): the six-panel presentation of the existing onboarding. Local component tests with fixtures; not hosted acceptance, not a visual match to the founder's image.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PremiumOnboarding from "./PremiumOnboarding";
import { OBJECTIVES } from "./onboardingPanels";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
const brain = (over = {}) => ({ brand_id: "b", project_id: "p", name: "Fixture Brand", identity: { description: "We do fixture things." }, audience: { summary: "Fixture customers" }, commercial: { primary_cta: "Book", differentiators: ["Family owned", "Since 1998"] },
  voice: { tone: "Warm and plain-spoken" }, visual: { colours: ["Forest green", "Cream"], photography_style: "Natural light" }, metadata: { version: 1, status: "draft" }, ...over });
const ONB = { contract_version: "workspace-onboarding.v1", version: 2, status: "in_progress", sector: { key: "perfume", source: "customer" }, channels: { values: ["email"], source: "customer" }, industry_text: null, draft: {}, current_step: 0 };
function view(stage, over = {}) {
  const props = { stage, setStage: vi.fn(), draft: { businessName: "Fixture Brand", website: "", challenge: "", description: "We do fixture things.", audience: "Fixture customers", cta: "Book", goal: "", industryText: "", sectorChoice: "" },
    setField: vi.fn(), channels: new Set(["Email"]), toggleChannel: vi.fn(), session: { status: "ready", accessToken: "t", tenantId: "t1", projectId: "p1", brandId: "b1" },
    brainState: { status: "ready", brain: brain() }, onLoadBrain: vi.fn(), onSave: vi.fn(), onBootstrap: vi.fn(), onRecommend: vi.fn(), recommendationState: { status: "idle", recommendation: null }, onFinish: vi.fn(), onOpenStudio: vi.fn(),
    onOpenBrand: vi.fn(), onOpenAccounts: vi.fn(), onboardingState: { status: "ready", onboarding: ONB, brandNamePlaceholder: false }, onLoadOnboarding: vi.fn(), onSaveProgress: vi.fn(), dirty: false, readOnly: false, membershipRole: "owner",
    onGoToStep: vi.fn(), getBrainBaseline: () => null, ...over };
  render(<PremiumOnboarding {...props} />);
  return props;
}

describe("six-panel progress", () => {
  it.each([[0, "Step 1 of 6: Welcome"], [1, "Step 2 of 6: Your business (part 1 of 2)"], [2, "Step 2 of 6: Your business (part 2 of 2)"], [3, "Step 3 of 6: Your goals"], [5, "Step 4 of 6: Brand setup"], [4, "Step 5 of 6: Channels"], [6, "Step 6 of 6: Review proposal"]])("stage %s says %s", (stage, text) => {
    view(stage, stage === 1 ? { session: { status: "scope-missing" }, onboardingState: { status: "idle" }, brainState: { status: "idle", brain: null } } : {});
    expect(document.querySelector(".ps-panel-count").textContent).toBe(text);
    expect(within(screen.getByRole("list", { name: "Setup progress" })).getAllByRole("listitem")).toHaveLength(6);
  });
  it("Continue and Back follow the founder's order: goals -> Brand setup -> Channels -> Review", () => {
    const apply = (fn, from) => fn(from);
    const p3 = view(3); fireEvent.click(screen.getByRole("button", { name: /^continue$/i })); expect(apply(p3.setStage.mock.calls[0][0], 3)).toBe(5); cleanup();
    const p5 = view(5); fireEvent.click(screen.getByRole("button", { name: /^continue$/i })); expect(apply(p5.setStage.mock.calls[0][0], 5)).toBe(4); cleanup();
    const p4 = view(4); fireEvent.click(screen.getByRole("button", { name: /^continue$/i })); expect(apply(p4.setStage.mock.calls[0][0], 4)).toBe(6); cleanup();
    const b4 = view(4); fireEvent.click(screen.getByRole("button", { name: /^back$/i })); expect(apply(b4.setStage.mock.calls[0][0], 4)).toBe(5);
  });
});

describe("welcome", () => {
  it("states the three assurances, uses no stock photography, and has a way to start", () => {
    view(0);
    const list = screen.getByRole("list", { name: /what bizgenie promises/i });
    expect(list).toHaveTextContent(/approve everything/i); expect(list).toHaveTextContent(/never publishes, schedules or connects/i);
    expect(document.querySelectorAll(".ps-onboarding img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeInTheDocument();
  });
});

describe("your business", () => {
  it("says website import is not available and still asks the customer to type their details", () => {
    view(1, { session: { status: "scope-missing" }, onboardingState: { status: "idle" }, brainState: { status: "idle", brain: null } });
    expect(screen.getByTestId("ps-import-note")).toHaveTextContent(/importing details from your website isn’t available yet/i);
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create my workspace/i })).toBeInTheDocument();
  });
});

describe("your goals", () => {
  it("shows the six objectives; choosing one writes its sentence into the goal and marks it pressed", () => {
    const p = view(3);
    const group = screen.getByRole("group", { name: /pick an objective/i });
    expect(within(group).getAllByRole("button")).toHaveLength(6);
    fireEvent.click(within(group).getByRole("button", { name: /increase online sales/i }));
    expect(p.setField).toHaveBeenCalledWith("goal", OBJECTIVES[1].text);
  });
  it("a goal that starts with an objective shows it as chosen, and others as not chosen", () => {
    view(3, { draft: { businessName: "x", website: "", challenge: "", description: "", audience: "", cta: "", goal: `${OBJECTIVES[2].text}. in my city`, industryText: "", sectorChoice: "" } });
    expect(screen.getByRole("button", { name: /build awareness/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /get more customers/i })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("brand setup", () => {
  it("shows what the Brand Brain holds for voice, key messages and colours, offers Edit into the real editor, and says logo upload is unavailable", () => {
    const p = view(5);
    const cards = screen.getByRole("group", { name: /brand setup/i });
    expect(cards).toHaveTextContent("Warm and plain-spoken"); expect(cards).toHaveTextContent("Family owned, Since 1998"); expect(cards).toHaveTextContent("Forest green, Cream · Natural light");
    expect(cards).toHaveTextContent(/logo upload isn't available in this version yet/i);
    expect(cards.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /edit voice in the brand brain editor/i })); expect(p.onOpenBrand).toHaveBeenCalledTimes(1);
  });
  it("an unloaded or empty Brand Brain never shows invented content", () => {
    view(5, { brainState: { status: "loading", brain: null } });
    expect(screen.getByRole("group", { name: /brand setup/i })).toHaveTextContent(/available once your brand brain has loaded/i);
    expect(screen.queryByRole("button", { name: /edit voice/i })).toBeNull();
  });
  it("an empty brand shows plain 'nothing yet' lines", () => {
    view(5, { brainState: { status: "ready", brain: brain({ voice: {}, visual: {}, commercial: { primary_cta: "Book" } }) } });
    expect(screen.getByRole("group", { name: /brand setup/i })).toHaveTextContent(/no tone of voice yet/i);
  });
});

describe("channels", () => {
  const card = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) }).closest(".ps-channel-wrap");
  it("by default nothing can be connected: every card says so and no Connect button exists", () => {
    view(4);
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();
    expect(card("TikTok")).toHaveTextContent(/connecting isn't available in this version yet/i);
    expect(card("Email")).toHaveTextContent(/planning only/i);
  });
  it("Connect appears only for a platform the verified social feature offers, and opens Accounts (it connects nothing itself)", () => {
    vi.stubEnv("VITE_SOCIAL_ACCOUNTS_API", "true"); vi.stubEnv("VITE_SOCIAL_PROVIDERS", "tiktok");
    const p = view(4);
    expect(within(card("TikTok")).getByRole("button", { name: /connect tiktok/i })).toBeInTheDocument();
    expect(within(card("Instagram")).queryByRole("button", { name: /connect/i })).toBeNull();
    expect(within(card("Email")).queryByRole("button", { name: /connect/i })).toBeNull();
    fireEvent.click(within(card("TikTok")).getByRole("button", { name: /connect tiktok/i })); expect(p.onOpenAccounts).toHaveBeenCalledTimes(1);
  });
  it("under the compatibility gate with an unverified API revision, Connect never appears even when the flags are on", () => {
    vi.stubEnv("VITE_SOCIAL_ACCOUNTS_API", "true"); vi.stubEnv("VITE_SOCIAL_PROVIDERS", "tiktok"); vi.stubEnv("VITE_API_COMPAT_MODE", "enforce"); vi.stubEnv("VITE_BIZGENIE_API_URL", "https://staging-api.example-host.com");
    view(4);
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();
  });
  it("choosing a channel only toggles the plan; the page promises no publishing without approval", () => {
    const p = view(4);
    fireEvent.click(screen.getByRole("button", { name: /^Instagram/ })); expect(p.toggleChannel).toHaveBeenCalledWith("Instagram");
    expect(document.body.textContent).toMatch(/never publishes without your approval/i);
  });
});

describe("review proposal", () => {
  it("summarises what the plan will be built from, with Edit links to the right stored stage, and promises nothing is generated or published", () => {
    const p = view(6, { draft: { businessName: "Fixture Brand", website: "", challenge: "", description: "d", audience: "Fixture customers", cta: "Book", goal: `${OBJECTIVES[0].text}. locally`, industryText: "", sectorChoice: "" }, channels: new Set(["Email", "TikTok"]) });
    expect(screen.getByRole("heading", { name: /review your campaign proposal/i })).toBeInTheDocument();
    const s = screen.getByRole("region", { name: /what bizgenie will plan from/i });
    expect(s).toHaveTextContent("Fixture Brand"); expect(s).toHaveTextContent("Get more customers"); expect(s).toHaveTextContent("TikTok, Email"); // always in the design's channel order, whatever order they were clicked
    const edits = within(s).getAllByRole("button", { name: "Edit" });
    fireEvent.click(edits[0]); fireEvent.click(edits[1]); fireEvent.click(edits[2]);
    expect(p.onGoToStep.mock.calls.map((c) => c[0])).toEqual([1, 3, 4]);
    expect(within(s).getByRole("list", { name: /what happens next/i })).toHaveTextContent(/nothing is generated, scheduled or published until you approve it and separately authorise it/i);
    expect(screen.getByRole("button", { name: /get my recommendation/i })).toBeEnabled(); // a goal exists, so a recommendation may be requested (it creates nothing)
  });
  it("without a goal there is no recommendation request and the objective reads 'Not chosen yet'", () => {
    view(6);
    expect(screen.getByRole("region", { name: /what bizgenie will plan from/i })).toHaveTextContent(/not chosen yet/i);
    expect(screen.getByRole("button", { name: /get my recommendation/i })).toBeDisabled();
  });
});
