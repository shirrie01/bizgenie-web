import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreativeStudio from "./CreativeStudio";
import { normaliseQuote } from "./generationQuoteClient";
import { normaliseJob, normaliseJobList } from "./creativeJobsClient";

const C = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222", Q = "33333333-3333-4333-8333-333333333333";
const session = { accessToken: "tk", tenantId: "t1" }; const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const campaign = { campaign_id: C, version: 4 }; const variant = { variant_id: V, platform: "instagram" };
const quote = (cls = "image.normal") => normaliseQuote({ contract_version: "generation-quote.v1", quote_id: Q, execution_class: cls, credits: 3, kind: "fixed", max_credits: 3, available_credits: 10, sufficient: true, expires_at: new Date(Date.now() + 60000).toISOString(), policy_version: "p:1", state: "quoted" });
const status = (state) => ({ quoteId: Q, jobId: "quoted:j", state, executionClass: "image.normal", reservedCredits: 3, reservation: "held" });
const JOB = (o = {}) => ({ contract_version: "creative-job.v1", job_id: "quoted:j", quote_id: Q, kind: "image", execution_class: "image.normal", state: "succeeded", content_dna: null, error_code: null, created_at: "2026-10-27T10:00:00Z", campaign_id: C, variant_id: V, outputs: [{ asset_id: "44444444-4444-4444-8444-444444444444", mime_type: "image/png", media_kind: "image", provenance: { origin: "ai_generated", supplied_asset_ids: [] } }], association: null, preview: null, can_cancel: false, retry_guidance: null, ...o });
const ASSOC = { campaign_id: C, variant_id: V, revision_id: "55555555-5555-4555-8555-555555555555", campaign_version: 5, current: true, current_campaign_version: 5, approval_status: "not_approved" };
const mount = (props = {}, api = {}) => render(<CreativeStudio enabled session={session} scope={scope} campaign={campaign} variant={variant} format="image" api={{ requestGenerationQuote: async ({ request }) => quote(request.execution_class), ...api }} pollMs={5} {...props} />);
const open = () => fireEvent.click(screen.getByText(/Create the (image|video) for this post/));
beforeEach(() => window.localStorage.clear()); afterEach(cleanup);

describe("CreativeStudio (quote/confirm based)", () => {
  it("renders nothing for a text item", () => { const { container } = render(<CreativeStudio enabled session={session} scope={scope} campaign={campaign} variant={variant} format="text" />); expect(container).toBeEmptyDOMElement(); });
  it("gate off: not available, names hybrid, offers no controls", () => { render(<CreativeStudio enabled={false} session={session} scope={scope} campaign={campaign} variant={variant} format="video" />); expect(screen.getByText(/videos is not available in BizGenie yet/i)).toBeInTheDocument(); expect(screen.getByText(/Hybrid .* is not available yet/)).toBeInTheDocument(); expect(screen.queryByRole("button")).toBeNull(); });
  it("asks for a brief only: no shape, length or provider choice, and says the server sets them", () => {
    mount(); open(); expect(screen.getByLabelText("Brief")).toBeInTheDocument(); expect(screen.queryByLabelText(/shape|length|model|provider/i)).toBeNull(); expect(screen.getByText(/The shape is set by BizGenie/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get the price for the image/ })).toBeDisabled();
  });
  it("the quote is for the image class with the brief; a video item offers a quality and prices as video.premium when chosen", async () => {
    const q = vi.fn(async ({ request }) => quote(request.execution_class)); mount({ format: "video" }, { requestGenerationQuote: q }); open();
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A short reveal" } }); fireEvent.change(screen.getByLabelText("Quality"), { target: { value: "premium" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Get the price for the video/ })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: /Get the price for the video/ })); await screen.findByRole("group", { name: "Price" });
    expect(q.mock.calls[0][0].request).toMatchObject({ execution_class: "video.premium", execution_mode: "ai", execution_brief: "A short reveal", campaign_id: C, variant_id: V, expected_campaign_version: 4, supplied_assets: [] });
  });
  it("locks the brief once confirmation is sent; Finished loads the server's result, offers Attach to the owner only, and never claims approval", async () => {
    const onFinished = vi.fn(); const attach = vi.fn(async () => normaliseJob(JOB({ association: ASSOC })));
    mount({ onFinished, canAttach: true }, { confirmGenerationQuote: async () => ({ jobId: "quoted:j", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status("succeeded"), fetchCreativeJob: async () => normaliseJob(JOB()), fetchCreativeJobs: async () => normaliseJobList({ contract_version: "creative-job-list.v1", jobs: [], next_cursor: null }), attachCreativeJob: attach }); open();
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A calm product shot" } }); await waitFor(() => expect(screen.getByRole("button", { name: /Get the price/ })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: /Get the price/ })); await screen.findByRole("group", { name: "Price" });
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ }));
    expect(await screen.findByText(/Finished\. 3 credits used/)).toBeInTheDocument(); expect(screen.getByLabelText("Brief")).toBeDisabled();
    expect(await screen.findByLabelText("Image result")).toBeInTheDocument(); expect(screen.getAllByText(/Finished is not approved and not published/).length).toBeGreaterThan(0); expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Attach to this post" })); expect(await screen.findByText(/Attached to the post/)).toBeInTheDocument();
    expect(attach.mock.calls[0][0]).toMatchObject({ jobId: "quoted:j" }); await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });
  it("a member (not owner) cannot attach", async () => {
    mount({ canAttach: false }, { confirmGenerationQuote: async () => ({ jobId: "quoted:j", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status("succeeded"), fetchCreativeJob: async () => normaliseJob(JOB()), fetchCreativeJobs: async () => normaliseJobList({ contract_version: "creative-job-list.v1", jobs: [], next_cursor: null }) }); open();
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A calm product shot" } }); await waitFor(() => expect(screen.getByRole("button", { name: /Get the price/ })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: /Get the price/ })); await screen.findByRole("group", { name: "Price" });
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); expect(await screen.findByText(/Only the workspace owner can attach/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Attach to this post" })).toBeNull();
  });
  it("read-only members see no create controls", () => { mount({ readOnly: true }); open(); expect(screen.queryByLabelText("Brief")).toBeNull(); expect(screen.getByText(/Only an owner or editor/)).toBeInTheDocument(); });
});
