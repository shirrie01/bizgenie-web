import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreativeJobResult from "./CreativeJobResult";
import CreativeJobsList from "./CreativeJobsList";
import { JobError, normaliseJob, normaliseJobList } from "./creativeJobsClient";

afterEach(cleanup);
const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const ASSET = "44444444-4444-4444-8444-444444444444"; const campaign = { campaign_id: "c1", version: 5 };
const J = (o = {}) => normaliseJob({ contract_version: "creative-job.v1", job_id: "j1", quote_id: "q1", kind: "image", execution_class: "image.normal", state: "succeeded", content_dna: null, error_code: null, created_at: "2026-10-27T10:00:00Z", campaign_id: "c1", variant_id: "v1", outputs: [{ asset_id: ASSET, mime_type: "image/png", media_kind: "image", provenance: { origin: "ai_generated" } }], association: null, preview: null, can_cancel: false, retry_guidance: null, ...o });
const strategy = { selected_strategy: { angle: "Checklist demo", specificity: "Tied to the exact objective", platform_execution: "A carousel" }, candidates: [{ angle: "Checklist demo" }, { angle: "Comparison" }], selection_evidence: { criteria: ["brand_truth"], rationale: "Fits the brand" } };
const ASSOC = { campaign_id: "c1", variant_id: "v1", revision_id: "r1", campaign_version: 5, current: true, current_campaign_version: 5, approval_status: "not_approved" };
const mount = (api, props = {}) => render(<CreativeJobResult jobId="j1" session={session} scope={scope} campaign={campaign} variant={{ variant_id: "v1", current_content: { asset_refs: [] } }} canAttach api={api} pollMs={5} {...props} />);

describe("CreativeJobResult", () => {
  it("loading, then a finished unattached image: stored privately, no preview yet, owner can attach", async () => {
    const attach = vi.fn(async () => J({ association: ASSOC })); const onAttached = vi.fn();
    mount({ fetchCreativeJob: async () => J(), attachCreativeJob: attach }, { onAttached });
    expect(screen.getByText("Loading the result…")).toBeInTheDocument();
    expect(await screen.findByLabelText("Image result")).toHaveTextContent(/stored privately/); expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Attach to this post" })); expect(await screen.findByText(/Attached to the post/)).toBeInTheDocument();
    expect(attach).toHaveBeenCalledTimes(1); expect(onAttached).toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Attach to this post" })).toBeNull();
    expect(screen.getByText(/Not approved yet/)).toBeInTheDocument(); expect(screen.getByText(/Approval applies only to the current version/)).toBeInTheDocument();
  });
  it("a strategy plan is shown as a plan, with no attach and no media", async () => {
    mount({ fetchCreativeJob: async () => J({ kind: "text", execution_class: "text.standard", outputs: [{ output_type: "strategy_plan", strategy }] }) });
    const card = await screen.findByLabelText("Strategy plan"); expect(card).toHaveTextContent("Checklist demo"); expect(card).toHaveTextContent(/cannot be attached to a post/); expect(card).toHaveTextContent("Comparison");
    expect(screen.queryByRole("button", { name: /attach/i })).toBeNull(); expect(screen.queryByLabelText(/Image result|Video result/)).toBeNull(); expect(screen.getByText(/Nothing here can be attached/)).toBeInTheDocument();
  });
  it("a text draft can be attached", async () => {
    mount({ fetchCreativeJob: async () => J({ kind: "text", execution_class: "text.standard", outputs: [{ output_type: "text", content: { title: null, body: "A short draft", caption: null, alt_text: null, asset_refs: [] }, provenance: { origin: "ai_generated" } }] }) });
    expect(await screen.findByLabelText("Written draft")).toHaveTextContent("A short draft"); expect(screen.getByRole("button", { name: "Attach to this post" })).toBeInTheDocument();
  });
  it("after attach, the owner can send the current version for review (never approve or publish); a member cannot; it is offered only while the post is still a draft carrying this asset", async () => {
    const REV = "55555555-5555-4555-8555-555555555555"; const withAsset = { variant_id: "v1", workflow: "draft", current_content: { asset_refs: [{ asset_id: ASSET, role: "primary" }] } };
    const attached = J({ association: { ...ASSOC, revision_id: REV } }); const submit = vi.fn(async () => ({})); const onSubmitted = vi.fn();
    const { unmount } = mount({ fetchCreativeJob: async () => attached, submitForReview: submit }, { variant: withAsset, onSubmitted });
    fireEvent.click(await screen.findByRole("button", { name: "Send for review" })); expect(await screen.findByText(/Sent for review\. Preview it and decide below; sending for review approves and publishes nothing/)).toBeInTheDocument();
    expect(submit.mock.calls[0][0]).toMatchObject({ revisionId: REV, variant: withAsset, campaign }); expect(onSubmitted).toHaveBeenCalled(); unmount();
    mount({ fetchCreativeJob: async () => attached }, { variant: withAsset, canAttach: false }); await screen.findByLabelText("Image result"); expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull(); cleanup();
    mount({ fetchCreativeJob: async () => attached }, { variant: { ...withAsset, workflow: "review" } }); await screen.findByLabelText("Image result"); expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull(); cleanup();
    mount({ fetchCreativeJob: async () => attached }, { variant: { variant_id: "v1", workflow: "draft", current_content: { asset_refs: [] } } }); await screen.findByLabelText("Image result"); expect(screen.queryByRole("button", { name: "Send for review" })).toBeNull();
  });
  it("a failed send for review is explained and can be retried", async () => {
    const withAsset = { variant_id: "v1", workflow: "draft", current_content: { asset_refs: [{ asset_id: ASSET, role: "primary" }] } };
    const submit = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Sending for review may or may not have been saved."), { kind: "unconfirmed" })).mockResolvedValue({});
    mount({ fetchCreativeJob: async () => J({ association: { ...ASSOC, revision_id: "55555555-5555-4555-8555-555555555555" } }), submitForReview: submit }, { variant: withAsset });
    fireEvent.click(await screen.findByRole("button", { name: "Send for review" })); expect(await screen.findByText(/may or may not have been saved/)).toHaveClass("ps-warn");
    fireEvent.click(screen.getByRole("button", { name: "Send for review" })); expect(await screen.findByText(/Sent for review/)).toBeInTheDocument();
  });
  it("a member sees the result but cannot attach", async () => { mount({ fetchCreativeJob: async () => J() }, { canAttach: false }); expect(await screen.findByText(/Only the workspace owner can attach/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Attach to this post" })).toBeNull(); });
  it("an attachment replaced by a newer version of the post is not shown as current", async () => {
    mount({ fetchCreativeJob: async () => J({ association: { ...ASSOC, current: false, approval: "approved" } }) });
    expect(await screen.findByText(/Replaced by a newer version of the post/)).toBeInTheDocument(); expect(screen.getByText(/A newer version of the post replaced this one/)).toBeInTheDocument(); expect(screen.queryByText(/Approved for this version/)).toBeNull();
  });
  it("follows a running job and can cancel it before it starts", async () => {
    const states = [J({ state: "queued", outputs: [], can_cancel: true }), J({ state: "calling", outputs: [] }), J()]; let i = 0; const cancel = vi.fn(async () => ({ jobId: "j1" }));
    mount({ fetchCreativeJob: async () => states[Math.min(i++, 2)], cancelCreativeJob: cancel });
    expect(await screen.findByText(/Waiting to start/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Cancel before it starts" })).toBeInTheDocument();
    expect(await screen.findByText(/Finished\./)).toBeInTheDocument();
  });
  it("failed and recovery states say what is safe", async () => {
    const { unmount } = mount({ fetchCreativeJob: async () => J({ state: "failed", outputs: [], retry_guidance: "new_quote_required" }) });
    expect(await screen.findByText(/You were not charged\. Get a new price/)).toBeInTheDocument(); unmount();
    mount({ fetchCreativeJob: async () => J({ state: "recovery_required", outputs: [], retry_guidance: "reconcile_do_not_resubmit" }) });
    expect(await screen.findByText(/Do not start it again; nothing is sent twice/)).toBeInTheDocument();
  });
  it("load errors are explained and retryable; a lost attach response is a warning, not a success; auth is reported", async () => {
    const ended = vi.fn(); const f = vi.fn().mockRejectedValueOnce(new JobError("Your session has ended.", { kind: "auth" })).mockResolvedValue(J());
    mount({ fetchCreativeJob: f, attachCreativeJob: vi.fn().mockRejectedValue(new JobError("may not have completed", { kind: "unconfirmed" })) }, { onSessionEnded: ended });
    expect(await screen.findByRole("alert")).toHaveTextContent(/session has ended/); expect(ended).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); fireEvent.click(await screen.findByRole("button", { name: "Attach to this post" }));
    expect(await screen.findByText(/may not have completed/)).toHaveClass("ps-warn"); expect(screen.getByRole("button", { name: "Attach to this post" })).toBeInTheDocument();
  });
});
describe("CreativeJobsList", () => {
  const L = (jobs) => normaliseJobList({ contract_version: "creative-job-list.v1", jobs, next_cursor: null });
  const row = (id, v = "v1", state = "succeeded") => ({ job_id: id, quote_id: "q", campaign_id: "c1", variant_id: v, execution_class: "image.normal", state, created_at: "2026-10-27T10:00:00Z" });
  const open = (api) => { const r = render(<CreativeJobsList session={session} scope={scope} campaign={campaign} variant={{ variant_id: "v1" }} canAttach api={api} />); fireEvent.click(screen.getByText("Earlier results for this post")); return r; };
  it("empty, then only this post's results; opening one loads it from the server", async () => {
    const { unmount } = open({ fetchCreativeJobs: async () => L([]) }); expect(await screen.findByText("Nothing has been made for this post yet.")).toBeInTheDocument(); unmount();
    const getJob = vi.fn(async () => J());
    open({ fetchCreativeJobs: async () => L([row("j1"), row("j2", "other")]), fetchCreativeJob: getJob });
    const list = await screen.findByRole("list", { name: "Earlier results" }); expect(list.querySelectorAll("li")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Open" })); expect(await screen.findByLabelText("Image result")).toBeInTheDocument(); expect(getJob.mock.calls[0][0]).toMatchObject({ jobId: "j1" });
  });
  it("a failed list can be retried", async () => {
    const f = vi.fn().mockRejectedValueOnce(new JobError("The list of results is not switched on for this workspace yet.", { kind: "unavailable" })).mockResolvedValue(L([row("j1")]));
    open({ fetchCreativeJobs: f }); expect(await screen.findByRole("alert")).toHaveTextContent(/not switched on/); fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(await screen.findByRole("list", { name: "Earlier results" })).toBeInTheDocument();
  });
});
