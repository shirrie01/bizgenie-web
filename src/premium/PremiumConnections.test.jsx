import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumConnections from "./PremiumConnections";
import PremiumInsights from "./PremiumInsights";
import { normaliseAccounts, normaliseQueue, SocialError } from "./socialClient";
import { normaliseInsights, normaliseResults } from "./insightsClient";

// FIXTURE-DRIVEN tests for proposed contracts: they prove what the screens say, not that any backend exists.
afterEach(cleanup);
const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const accounts = (list) => normaliseAccounts({ contract_version: "social-accounts.v1", accounts: list });
const A = (o = {}) => ({ account_id: "a1", provider: "instagram", display_name: "Test Account", status: "connected", scopes_granted: ["publish"], connected_at: "2026-10-01T00:00:00Z", token_expires_at: "2026-12-01T00:00:00Z", ...o });
const Q = (items) => normaliseQueue({ contract_version: "publishing-queue.v1", items });
const I = (o = {}) => ({ publication_id: "pub1", campaign_id: "c1", variant_id: "v1", account_id: "a1", scheduled_for: "2026-11-01T10:00:00Z", status: "published", attempts: 1, last_error_code: null, platform_post_url: "https://example.test/post/1", verified_by: "platform", ...o });

describe("PremiumConnections", () => {
  it("gate off: says nothing is connected and BizGenie does not publish, explains the manual route, calls nothing, has no buttons", () => {
    const f = vi.fn(); render(<PremiumConnections enabled={false} session={session} scope={scope} isOwner api={{ fetchAccounts: f, fetchQueue: f }} />);
    expect(screen.getByText(/not available in BizGenie yet/i)).toBeInTheDocument(); expect(screen.getByText(/does not publish for you/i)).toBeInTheDocument(); expect(screen.getByText(/labelled as entered by you/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("shows connection health from the server only, and the owner can connect (Stripe-style redirect) with the request id reused on retry", async () => {
    const onRedirect = vi.fn(); const connect = vi.fn().mockRejectedValueOnce(new SocialError("may or may not", { kind: "unconfirmed" })).mockResolvedValueOnce({ url: "https://provider.example.test/oauth" });
    render(<PremiumConnections enabled session={session} scope={scope} isOwner onRedirect={onRedirect} api={{ fetchAccounts: async () => accounts([A(), A({ account_id: "a2", provider: "linkedin", display_name: "Biz Page", status: "needs_reauth" })]), fetchQueue: async () => Q([]), startConnect: connect }} />);
    expect(await screen.findByText("Needs reconnecting")).toBeInTheDocument(); expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Instagram" })).toBeNull(); // already connected
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/may or may not/);
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://provider.example.test/oauth"));
    expect(connect.mock.calls[0][0].id).toBe(connect.mock.calls[1][0].id); expect(screen.getByText(/shows as connected only after Facebook confirms it/)).toBeInTheDocument();
  });
  it("disconnect asks first and says published posts stay", async () => {
    const dis = vi.fn(async () => ({ accountId: "a1" }));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner api={{ fetchAccounts: async () => accounts([A()]), fetchQueue: async () => Q([]), disconnect: dis }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Test Account" }));
    expect(dis).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(await screen.findByText(/already published stays on the platform/)).toBeInTheDocument(); expect(dis).toHaveBeenCalledTimes(1);
  });
  it("a member sees accounts but no connect or disconnect", async () => {
    render(<PremiumConnections enabled session={session} scope={scope} isOwner={false} api={{ fetchAccounts: async () => accounts([A()]), fetchQueue: async () => Q([]) }} />);
    expect(await screen.findByText("Connected")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /connect|disconnect/i })).toBeNull(); expect(screen.getByText(/Only the workspace owner can connect/)).toBeInTheDocument();
  });
  it("the queue: platform-confirmed vs not; failure and unknown outcomes are stated plainly", async () => {
    render(<PremiumConnections enabled session={session} scope={scope} isOwner api={{ fetchAccounts: async () => accounts([A()]), fetchQueue: async () => Q([I(), I({ publication_id: "p2", verified_by: null }), I({ publication_id: "p3", status: "failed", attempts: 2, last_error_code: "TOKEN_EXPIRED", platform_post_url: null, verified_by: null }), I({ publication_id: "p4", status: "needs_reconciliation", platform_post_url: null, verified_by: null })]) }} />);
    expect(await screen.findByText("Confirmed by the platform")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute("href", "https://example.test/post/1");
    expect(screen.getByText("Not confirmed by the platform")).toBeInTheDocument(); expect(screen.getByText(/Reason code TOKEN_EXPIRED\. 2 attempts made/)).toBeInTheDocument(); expect(screen.getByText(/will not send it again until that is checked/)).toBeInTheDocument();
  });
  it("errors are explained and retryable; a session that ended is reported", async () => {
    const ended = vi.fn(); const f = vi.fn().mockRejectedValueOnce(new SocialError("Your session has ended.", { kind: "auth" })).mockResolvedValue(accounts([]));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner onSessionEnded={ended} api={{ fetchAccounts: f, fetchQueue: async () => Q([]) }} />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(/session has ended/); expect(ended).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]); expect(await screen.findByText("No accounts are connected yet.")).toBeInTheDocument();
  });
});

describe("PremiumInsights", () => {
  const res = (m) => normaliseResults({ contract_version: "campaign-results.v1", metrics: m });
  const M = (o = {}) => ({ metric: "clicks", value: 12, unit: "count", observed_at: "2026-10-20T00:00:00Z", source: "customer_entered", fresh_as_of: "2026-10-21T00:00:00Z", ...o });
  const ins = (list) => normaliseInsights({ contract_version: "learning-insights.v1", insights: list });
  const IN = (o = {}) => ({ insight_id: "i1", statement: "FIXTURE suggestion text", confidence: "low", status: "proposed", generated_by: "ai", created_at: "2026-10-22T00:00:00Z", evidence: [{ source: "customer_entered", metric: "clicks", period_from: "2026-10-01T00:00:00Z", period_to: "2026-10-20T00:00:00Z", sample_size: 3 }], ...o });
  it("gate off: says nothing was measured or learned, defines the four labels, calls nothing", () => {
    const f = vi.fn(); render(<PremiumInsights enabled={false} session={session} scope={scope} isOwner api={{ fetchInsights: f, fetchResults: f }} />);
    expect(screen.getByText(/has not measured anything for you, and it has not learned from your performance/i)).toBeInTheDocument();
    for (const l of ["Entered by you", "Measured by the platform", "Estimate", "AI suggestion"]) expect(screen.getByText(l)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).toBeNull();
  });
  it("every result row carries its origin; an unlabelled one is reported as left out", async () => {
    render(<PremiumInsights enabled session={session} scope={scope} campaignId="c1" campaignName="Spring" isOwner api={{ fetchResults: async () => res([M(), M({ metric: "reach", source: "platform_measured", value: 900 }), M({ metric: "views", source: undefined })]), fetchInsights: async () => ins([]) }} />);
    const table = await screen.findByRole("table"); expect(table).toHaveTextContent("Entered by you"); expect(table).toHaveTextContent("Measured by the platform");
    expect(screen.getByText(/1 result could not be shown because its origin was missing/)).toBeInTheDocument(); expect(screen.getByText(/There are no suggestions yet/)).toBeInTheDocument();
  });
  it("suggestions are labelled AI, show evidence, and the owner can accept once; the wording says it changes nothing by itself", async () => {
    const decide = vi.fn(async () => ({ insightId: "i1", status: "accepted" }));
    render(<PremiumInsights enabled session={session} scope={scope} campaignId="c1" isOwner api={{ fetchResults: async () => res([]), fetchInsights: async () => ins([IN(), IN({ insight_id: "i2", evidence: [] })]), decideInsight: decide }} />);
    expect(await screen.findByText("FIXTURE suggestion text")).toBeInTheDocument(); expect(screen.getAllByText("AI suggestion").length).toBeGreaterThan(0); expect(screen.getByText(/1 suggestion were left out because they came without evidence/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Evidence \(1\)/)); expect(screen.getByText(/Clicks, entered by you/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/does not change your Brand Brain or any campaign by itself/)).toBeInTheDocument(); expect(decide).toHaveBeenCalledTimes(1); expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });
  it("members cannot decide; errors are retryable", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("Your insights could not be loaded yet.")).mockResolvedValue(ins([IN()]));
    render(<PremiumInsights enabled session={session} scope={scope} isOwner={false} api={{ fetchInsights: f }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/); fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Only the workspace owner can accept or reject/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });
});
