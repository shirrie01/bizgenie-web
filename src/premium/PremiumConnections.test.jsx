import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumConnections from "./PremiumConnections";
import PremiumInsights from "./PremiumInsights";
import { normaliseAccounts, normaliseQueue, SocialError } from "./socialClient";
import { observationRow, recommendation, snapshotAvailable, snapshotStale } from "../intel/fixtures";

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

describe("PremiumInsights (canonical performance-evidence models)", () => {
  const snapApi = (body, extra = {}) => ({ fetchSnapshot: async () => body, ...extra });
  it("gate off: says nothing was measured or learned, defines the labels, calls nothing", () => {
    const f = vi.fn(); render(<PremiumInsights enabled={false} session={session} scope={scope} isOwner api={{ fetchSnapshot: f, fetchRecommendations: f }} />);
    expect(screen.getByText(/has not measured anything for you, and it has not learned from your performance/i)).toBeInTheDocument();
    for (const l of ["Entered by you", "Measured by the platform", "Observed change", "Sample data"]) expect(screen.getByText(l)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).toBeNull();
  });
  it("gate on but no fetcher (no backend route): says it is not connected and shows nothing", () => {
    render(<PremiumInsights enabled session={session} scope={scope} isOwner />);
    expect(screen.getByText(/Platform results are not connected yet/)).toBeInTheDocument(); expect(screen.queryByRole("table")).toBeNull();
  });
  it("shows platform rows with provenance, freshness and period; a customer attestation is left out and counted", async () => {
    const snap = snapshotAvailable(); snap.observations.push(observationRow(4, { source: { kind: "customer_attestation", source_id: "s", account_id: "a", record_id: "r" } }));
    render(<PremiumInsights enabled session={session} scope={scope} campaignName="Spring" isOwner now={Date.parse("2026-10-12T00:00:00Z")} api={snapApi(snap)} />);
    const table = await screen.findByRole("table"); expect(table).toHaveTextContent("Measured by the platform"); expect(table).toHaveTextContent("TikTok · Organic");
    expect(screen.getByText(/Last updated 3 days ago/)).toBeInTheDocument(); expect(screen.getByText(/1 row could not be shown/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("What each measure means")); expect(screen.getByText(/Taps or clicks on a link/)).toBeInTheDocument();
  });
  it("filters by platform", async () => {
    render(<PremiumInsights enabled session={session} scope={scope} isOwner api={snapApi(snapshotAvailable())} />);
    await screen.findByRole("table"); fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "tiktok" } });
    expect(screen.queryByText(/Instagram · Organic/)).toBeNull(); expect(screen.getByText(/TikTok · Organic/)).toBeInTheDocument();
  });
  it("stale or withdrawn data shows words, not zeros; sample data is labelled; a malformed body is an error", async () => {
    const { unmount } = render(<PremiumInsights enabled session={session} scope={scope} isOwner api={snapApi(snapshotStale())} />);
    expect(await screen.findByText(/too old to show/)).toBeInTheDocument(); unmount();
    const r2 = render(<PremiumInsights enabled session={session} scope={scope} isOwner api={{ ...snapApi(snapshotAvailable()), synthetic: true }} />);
    expect(await screen.findByText(/made up to test the screen/)).toBeInTheDocument(); expect((await screen.findByRole("table")).textContent).toMatch(/Sample data/); expect(r2.container.textContent).not.toMatch(/Measured by the platform<\/span>/); r2.unmount();
    render(<PremiumInsights enabled session={session} scope={scope} isOwner api={snapApi({ contract_version: "x" })} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not in the expected form/);
  });
  it("recommendations are observed changes; unsafe ones are left out; the owner's decision is kept on this device and changes nothing", async () => {
    const api = snapApi(snapshotAvailable(), { fetchRecommendations: async () => [recommendation(), recommendation({ causal_claim: true })] });
    render(<PremiumInsights enabled session={session} scope={scope} isOwner api={api} />);
    expect(await screen.findByText(/This is an observed change only/)).toBeInTheDocument();
    expect(screen.getByText(/1 suggestion was left out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByText(/kept on this device only. It is not sent to BizGenie yet and changes nothing/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });
  it("members cannot decide; errors are retryable; 401 ends the session", async () => {
    const ended = vi.fn(); const f = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Your results could not be loaded yet."), { kind: "auth" })).mockResolvedValue(snapshotAvailable());
    render(<PremiumInsights enabled session={session} scope={scope} isOwner={false} onSessionEnded={ended} api={{ fetchSnapshot: f, fetchRecommendations: async () => [recommendation()] }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be loaded/); expect(ended).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Only the owner can decide/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  });

  it("with a persisted recommendation and a sender, Accept sends the backend's body once with a stable key and says it was saved; stale evidence cannot be decided", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa"; const send = vi.fn().mockRejectedValueOnce(new Error("Your decision could not be saved. It was not recorded; try again.")).mockResolvedValue({ ok: true });
    const api = snapApi(snapshotAvailable(), { sendFeedback: send, fetchRecommendations: async () => [recommendation({ recommendation_id: id, evidence_state: "current" }), recommendation({ recommendation_id: "00000000-0000-4000-8000-0000000000bb", evidence_state: "unavailable", evidence: ["c".repeat(64), "d".repeat(64)] })] });
    render(<PremiumInsights enabled session={session} scope={scope} isOwner api={api} />);
    expect(await screen.findByText("No longer available")).toBeInTheDocument(); expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not recorded/); fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Accepted by you and saved/)).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(2); const [a, b] = send.mock.calls.map((c) => c[0].body);
    expect(a).toMatchObject({ recommendation_id: id, decision: "accepted", expected_version: 0 }); expect(a.idempotency_key).toBe(b.idempotency_key); expect(a).not.toHaveProperty("recommendation_hash");
  });
});
