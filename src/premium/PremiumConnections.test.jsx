import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumConnections from "./PremiumConnections";
import PremiumInsights from "./PremiumInsights";
import { normaliseConnections, normaliseDispatches, SocialError } from "./socialClient";
import { observationRow, recommendation, snapshotAvailable, snapshotStale } from "../intel/fixtures";

// FIXTURE-DRIVEN tests of the screens against the #218 /customer/social contract shapes (the shapes themselves are checked against the real
// backend in qa/integration). They prove what the screens say, not that any platform is connected.
afterEach(cleanup); beforeEach(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });
const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const C = (o = {}) => ({ connection_id: "c1", platform: "instagram", account_id: "acct_one", status: "active", expires_at: "2026-12-01T00:00:00Z", version: 1, ...o });
const conns = (list) => normaliseConnections({ connections: list, next_cursor: null });
const D = (o = {}) => ({ dispatch_id: "d1", campaign_id: "c1", variant_id: "v1", revision_id: "r1", state: "published", scheduled_for: "2026-11-01T10:00:00Z", publication_id: "pub1", publication_url: "https://example.test/post/1", published_at: "2026-11-01T10:01:00Z", evidence_kind: "platform_api", ...o });
const disp = (list) => normaliseDispatches({ dispatches: list, next_cursor: null });
const none = async () => disp([]);

describe("PremiumConnections", () => {
  it("gate off: says nothing is connected and BizGenie does not publish, explains the manual route, calls nothing, has no buttons", () => {
    const f = vi.fn(); render(<PremiumConnections enabled={false} session={session} scope={scope} isOwner api={{ fetchConnections: f, fetchDispatches: f }} />);
    expect(screen.getByText(/not switched on in BizGenie yet/i)).toBeInTheDocument(); expect(screen.getByText(/does not publish for you/i)).toBeInTheDocument(); expect(screen.getByText(/labelled as entered by you/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("shows connection health from the server only; the owner connects: the verifier is kept for the round trip and the browser is sent to the platform", async () => {
    const onRedirect = vi.fn(); const connect = vi.fn().mockRejectedValueOnce(new SocialError("may or may not", { kind: "unconfirmed" })).mockResolvedValueOnce({ url: "https://provider.example.test/oauth", pending: { intentId: "i1", state: "s1", verifier: "v".repeat(43), provider: "facebook" } });
    render(<PremiumConnections enabled session={session} scope={scope} isOwner onRedirect={onRedirect} search="" api={{ fetchConnections: async () => conns([C(), C({ connection_id: "c2", platform: "linkedin", account_id: "biz", status: "expired" })]), fetchDispatches: none, startConnect: connect }} />);
    expect(await screen.findByText("Needs reconnecting")).toBeInTheDocument(); expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Instagram" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/may or may not/);
    fireEvent.click(screen.getByRole("button", { name: "Connect Facebook" }));
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith("https://provider.example.test/oauth"));
    expect(JSON.parse(sessionStorage.getItem("bizgenie.social.pending"))).toMatchObject({ intentId: "i1", state: "s1", provider: "facebook" });
    expect(screen.getByText(/shows as connected only after Facebook confirms it/)).toBeInTheDocument();
  });
  it("returning from the platform: completes only against the attempt this browser started, then clears the verifier", async () => {
    sessionStorage.setItem("bizgenie.social.pending", JSON.stringify({ intentId: "i1", state: "s1", verifier: "v".repeat(43), provider: "instagram" }));
    const complete = vi.fn(async () => C());
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="?code=abc&state=s1" api={{ fetchConnections: async () => conns([]), fetchDispatches: none, completeConnect: complete }} />);
    expect(await screen.findByText(/Instagram is connected/)).toBeInTheDocument();
    expect(complete.mock.calls[0][0]).toMatchObject({ code: "abc", state: "s1", pending: { intentId: "i1" } }); expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull();
  });
  it("a callback with no matching attempt is reported, not connected", async () => {
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="?code=abc&state=zzz" api={{ fetchConnections: async () => conns([]), fetchDispatches: none }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not match this connection attempt/);
  });
  it("consent refused on the platform (error=access_denied, no code): nothing is connected, the attempt is cleared, the query is stripped", async () => {
    sessionStorage.setItem("bizgenie.social.pending", JSON.stringify({ intentId: "i1", state: "s1", verifier: "v".repeat(43), provider: "instagram" }));
    const complete = vi.fn(); render(<PremiumConnections enabled session={session} scope={scope} isOwner search="?error=access_denied&state=s1" api={{ fetchConnections: async () => conns([]), fetchDispatches: none, completeConnect: complete }} />);
    expect(await screen.findByText(/Permission was not given on the platform, so nothing was connected/)).toBeInTheDocument(); expect(complete).not.toHaveBeenCalled(); expect(sessionStorage.getItem("bizgenie.social.pending")).toBeNull();
  });
  it("an uncertain provider answer is not 'nothing changed': it tells the owner to check accounts first", async () => {
    sessionStorage.setItem("bizgenie.social.pending", JSON.stringify({ intentId: "i1", state: "s1", verifier: "v".repeat(43), provider: "instagram" }));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="?code=abc&state=s1" api={{ fetchConnections: async () => conns([]), fetchDispatches: none, completeConnect: vi.fn().mockRejectedValue(new SocialError("The platform did not give a clear answer. Check your connected accounts before starting again.", { kind: "unconfirmed" })) }} />);
    const warn = await screen.findByText(/Check your connected accounts before starting again/); expect(warn).toHaveClass("ps-warn"); expect(warn.textContent).not.toMatch(/Nothing was changed/);
  });
  it("shows the verified display name when there is one, the account id otherwise, and says when permission ended", async () => {
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="" api={{ fetchConnections: async () => conns([C({ display_name: "Northgate Leasing" }), C({ connection_id: "c2", platform: "facebook", account_id: "acct_two", status: "expired" })]), fetchDispatches: none }} />);
    const list = await screen.findByRole("list", { name: "Connected accounts" }); expect(list).toHaveTextContent("Northgate Leasing"); expect(list).toHaveTextContent("acct_two"); expect(list).toHaveTextContent(/permission ended/);
  });
  it("a member never triggers a callback completion", async () => {
    const complete = vi.fn(); render(<PremiumConnections enabled session={session} scope={scope} isOwner={false} search="?code=abc&state=s1" api={{ fetchConnections: async () => conns([]), fetchDispatches: none, completeConnect: complete }} />);
    await screen.findByText("No accounts are connected yet."); expect(complete).not.toHaveBeenCalled();
  });
  it("disconnect asks first and says published posts stay", async () => {
    const dis = vi.fn(async () => ({ connectionId: "c1" }));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="" api={{ fetchConnections: async () => conns([C()]), fetchDispatches: none, disconnect: dis }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect acct_one" }));
    expect(dis).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    expect(await screen.findByText(/already published stays on the platform/)).toBeInTheDocument(); expect(dis).toHaveBeenCalledTimes(1); expect(dis.mock.calls[0][0].connectionId).toBe("c1");
  });
  it("a member sees accounts but no connect or disconnect", async () => {
    render(<PremiumConnections enabled session={session} scope={scope} isOwner={false} search="" api={{ fetchConnections: async () => conns([C()]), fetchDispatches: none }} />);
    expect(await screen.findByText("Connected")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /connect|disconnect|cancel/i })).toBeNull(); expect(screen.getByText(/Only the workspace owner can connect/)).toBeInTheDocument();
  });
  it("publishing list: platform-confirmed needs platform evidence and an https link; failure and unknown outcomes are stated plainly; queued posts can be cancelled by the owner", async () => {
    const cancel = vi.fn(async () => ({ state: "cancelled" }));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="" api={{ fetchConnections: async () => conns([C()]), cancelDispatch: cancel, fetchDispatches: async () => disp([D(), D({ dispatch_id: "d2", evidence_kind: null }), D({ dispatch_id: "d3", state: "failed", publication_url: null, evidence_kind: null }), D({ dispatch_id: "d4", state: "reconciliation_required", publication_url: null, evidence_kind: null }), D({ dispatch_id: "d5", state: "queued", publication_url: null, evidence_kind: null })]) }} />);
    expect(await screen.findByText("Confirmed by the platform")).toBeInTheDocument(); expect(screen.getByRole("link", { name: "View post" })).toHaveAttribute("href", "https://example.test/post/1");
    expect(screen.getByText("Not confirmed by the platform")).toBeInTheDocument(); expect(screen.getByText(/The platform refused it/)).toBeInTheDocument(); expect(screen.getByText(/will not send it again until that is checked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(await screen.findByText(/will not be sent/)).toBeInTheDocument(); expect(cancel.mock.calls[0][0].dispatchId).toBe("d5");
  });
  it("errors are explained and retryable; a session that ended is reported", async () => {
    const ended = vi.fn(); const f = vi.fn().mockRejectedValueOnce(new SocialError("Your session has ended.", { kind: "auth" })).mockResolvedValue(conns([]));
    render(<PremiumConnections enabled session={session} scope={scope} isOwner search="" onSessionEnded={ended} api={{ fetchConnections: f, fetchDispatches: none }} />);
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

  describe("real-route mode (refreshSnapshot / createRecommendation / fetchRecommendations)", () => {
    const rec = (o = {}) => recommendation({ recommendation_id: "00000000-0000-4000-8000-0000000000aa", evidence_state: "current", decision: null, feedback_version: 0, ...o });
    const real = (extra = {}) => ({ refreshSnapshot: vi.fn(async () => ({ ...snapshotAvailable(), snapshot_id: "00000000-0000-4000-8000-0000000000ee" })), fetchRecommendations: vi.fn(async () => [rec()]), ...extra });
    it("an owner reads nothing until they ask; Refresh stores one snapshot and shows platform rows", async () => {
      const api = real(); render(<PremiumInsights enabled session={session} scope={scope} isOwner api={api} now={Date.parse("2026-10-12T00:00:00Z")} />);
      expect(await screen.findByText(/Nothing is read until you ask/)).toBeInTheDocument(); expect(api.refreshSnapshot).not.toHaveBeenCalled(); expect(api.fetchRecommendations).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Read the latest platform results" })); expect(await screen.findByRole("table")).toHaveTextContent("Measured by the platform"); expect(api.refreshSnapshot).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/The results were refreshed/)).toBeInTheDocument();
    });
    it("a member never triggers a snapshot; they see the shared suggestions and are told who refreshes", async () => {
      const api = real(); render(<PremiumInsights enabled session={session} scope={scope} isOwner={false} api={api} />);
      expect(await screen.findByText(/The workspace owner refreshes platform results/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /platform results|Refresh results/ })).toBeNull(); expect(api.refreshSnapshot).not.toHaveBeenCalled();
      expect(await screen.findByRole("list", { name: "Changes worth reviewing" })).toBeInTheDocument(); expect(screen.getByText(/Only the owner can decide/)).toBeInTheDocument();
    });
    it("the owner can ask for a change between the two most recent periods; it is added and listed", async () => {
      const create = vi.fn(async () => ({})); const second = observationRow(2, { value: 52, period: { from: "2026-10-08T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" }, observed_at: "2026-10-16T00:00:00.000Z" });
      const snap = { ...snapshotAvailable(), observations: [observationRow(1), second] }; const api = real({ createRecommendation: create, refreshSnapshot: vi.fn(async () => ({ ...snap, snapshot_id: "00000000-0000-4000-8000-0000000000ee" })) });
      render(<PremiumInsights enabled session={session} scope={scope} isOwner api={api} now={Date.parse("2026-10-17T00:00:00Z")} />);
      fireEvent.click(await screen.findByRole("button", { name: "Read the latest platform results" })); await screen.findByRole("table");
      fireEvent.click(screen.getByRole("button", { name: /Look for a change in Instagram Clicks/ })); expect(await screen.findByText(/A change to review was added below/)).toBeInTheDocument();
      expect(create.mock.calls[0][0]).toMatchObject({ snapshotId: "00000000-0000-4000-8000-0000000000ee", previousId: observationRow(1).observation.observation_id, currentId: second.observation.observation_id }); expect(api.fetchRecommendations).toHaveBeenCalledTimes(2);
    });
    it("a decision already recorded by the server is shown as saved with no buttons; an invalidated one says it no longer applies; a new decision carries the server's version", async () => {
      const send = vi.fn(async () => ({ decision: "accepted", version: 2 }));
      const list = [rec({ decision: "accepted", feedback_version: 1 }), rec({ recommendation_id: "00000000-0000-4000-8000-0000000000bb", decision: "invalidated", feedback_version: 1, evidence_state: "unavailable" }), rec({ recommendation_id: "00000000-0000-4000-8000-0000000000cc", feedback_version: 3 })].map((r, i) => ({ ...r, evidence: [String(i + 1).repeat(64).slice(0, 64), "f".repeat(64)] }));
      render(<PremiumInsights enabled session={session} scope={scope} isOwner api={{ fetchRecommendations: async () => list, sendFeedback: send }} />);
      expect(await screen.findByText(/Accepted by you and saved/)).toBeInTheDocument(); expect(screen.getByText(/Your earlier decision no longer applies/)).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1); fireEvent.click(screen.getByRole("button", { name: "Accept" }));
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1)); expect(send.mock.calls[0][0].body).toMatchObject({ recommendation_id: "00000000-0000-4000-8000-0000000000cc", decision: "accepted", expected_version: 3 });
    });
    it("failures are explained and retryable; an unavailable service says so; auth is reported", async () => {
      const ended = vi.fn(); const f = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Results and suggestions are not switched on for this workspace yet."), { kind: "unavailable" })).mockResolvedValue([rec()]);
      const { unmount } = render(<PremiumInsights enabled session={session} scope={scope} isOwner api={{ fetchRecommendations: f }} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(/not switched on/); fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(await screen.findByRole("list", { name: "Changes worth reviewing" })).toBeInTheDocument(); unmount();
      render(<PremiumInsights enabled session={session} scope={scope} isOwner onSessionEnded={ended} api={{ fetchRecommendations: async () => { throw Object.assign(new Error("Your session has ended."), { kind: "auth" }); } }} />); await screen.findByRole("alert"); expect(ended).toHaveBeenCalled();
    });
  });
});
