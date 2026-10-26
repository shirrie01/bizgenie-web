import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreativeStudio from "./CreativeStudio";
import { CreativeError, normaliseCapabilities, normaliseJob } from "./creativeProductionClient";

const caps = normaliseCapabilities({ kinds: ["image", "video", "hybrid"], platforms: [{ key: "fx", label: "FX Platform", aspect_ratios: ["1:1", "9:16"] }], max_assets: 2, max_asset_bytes: 2097152, content_types: ["image/png"], max_brief_chars: 300 });
const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const campaign = { campaign_id: "c1", version: 2 }; const variant = { variant_id: "v1" };
const job = (o = {}) => normaliseJob({ job_id: "j1", kind: "image", status: "ready_for_review", credits_charged: 3, outputs: [{ output_id: "o1", kind: "image", url: "https://cdn.example.test/a.png", width: 10, height: 10, provenance: { origin: "ai_generated" } }], ...o });
const quote = { quoteId: "q1", executionClass: "image.normal", credits: 3, kind: "fixed", maxCredits: 3, authorisedCredits: 3, availableCredits: 20, sufficient: true, expiresAt: Date.now() + 600000 };
const mount = (api, props = {}) => render(<CreativeStudio enabled quotesEnabled session={session} scope={scope} campaign={campaign} variant={variant} api={{ fetchCapabilities: async () => caps, fetchAssets: async () => ({ assets: [], skipped: 0 }), requestGenerationQuote: async () => quote, ...api }} pollMs={5} {...props} />);
beforeEach(() => { try { window.localStorage.clear(); } catch {} });
afterEach(cleanup);

async function fillImage() {
  await screen.findByLabelText("Brief");
  fireEvent.click(screen.getByLabelText("Image"));
  fireEvent.change(screen.getByLabelText("Where will it be used?"), { target: { value: "fx" } });
  fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "1:1" } });
  fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A calm product shot" } });
}
const open = () => fireEvent.click(screen.getByText("Create an image or video for this post"));

describe("CreativeStudio", () => {
  it("gate off: says it is not available, offers no controls, calls nothing", () => {
    const f = vi.fn(); render(<CreativeStudio enabled={false} session={session} scope={scope} campaign={campaign} variant={variant} api={{ fetchCapabilities: f }} />);
    expect(screen.getByText(/not available in BizGenie yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("loads options only when opened, and offers only what the server offers", async () => {
    const f = vi.fn(async () => caps); mount({ fetchCapabilities: f });
    expect(f).not.toHaveBeenCalled(); open();
    await screen.findByLabelText("Brief"); expect(f).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Hybrid: your own media with AI".replace("your own media with AI", "your media with AI"))).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "FX Platform" })).toBeInTheDocument();
  });
  it("capabilities failure is explained and can be retried", async () => {
    const f = vi.fn().mockRejectedValueOnce(new CreativeError("Loading creative options could not be reached. Nothing was started or charged.")).mockResolvedValueOnce(caps);
    mount({ fetchCapabilities: f }); open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing was started/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByLabelText("Brief");
  });
  it("tells the customer what is still needed and keeps Check the cost unavailable", async () => {
    mount({}); open(); await screen.findByLabelText("Brief");
    fireEvent.click(screen.getByLabelText("Image"));
    expect(screen.getByRole("list", { name: "What is still needed" })).toHaveTextContent(/Choose where it will be used/);
    expect(screen.getByRole("button", { name: "Check the credit cost" })).toBeDisabled();
  });
  it("hybrid requires media and shows the rights confirmation before upload is possible", async () => {
    mount({}); open(); await screen.findByLabelText("Brief");
    fireEvent.click(screen.getByLabelText("Hybrid: your media with AI"));
    expect(await screen.findByText(/have not added any media yet/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Add media")).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I have the right to use this media/));
    expect(screen.getByLabelText("Add media")).not.toBeDisabled();
    expect(screen.getByRole("list", { name: "What is still needed" })).toHaveTextContent(/at least one of your own/);
  });
  it("uploaded media is selected for the hybrid brief and sent as supplied assets in the quote", async () => {
    const asset = { id: "a1", kind: "image", filename: "me.png", bytes: 100, rightsConfirmed: true };
    const upload = vi.fn(async () => asset); const q = vi.fn(async () => quote);
    mount({ uploadAsset: upload, requestGenerationQuote: q }); open(); await screen.findByLabelText("Brief");
    fireEvent.click(screen.getByLabelText("Hybrid: your media with AI"));
    fireEvent.change(screen.getByLabelText("Where will it be used?"), { target: { value: "fx" } });
    fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "9:16" } });
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "Make it pop" } });
    await screen.findByText(/have not added any media yet/i);
    fireEvent.click(screen.getByLabelText(/I have the right to use this media/));
    fireEvent.change(screen.getByLabelText("Add media"), { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByLabelText(/me\.png/)).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Check the credit cost" }));
    await screen.findByRole("group", { name: "Credit cost" });
    expect(q.mock.calls[0][0]).toMatchObject({ executionMode: "hybrid", suppliedAssets: ["a1"], executionClass: "image.normal" });
  });
  it("shows the cost first, then starts only after confirmation, then follows the job to ready with provenance", async () => {
    const start = vi.fn(async () => ({ jobId: "j1" }));
    const jobs = [job({ status: "queued", outputs: [], credits_charged: null }), job({ status: "running", outputs: [], credits_charged: null }), job()];
    const fetchJob = vi.fn(async () => jobs.length > 1 ? jobs.shift() : jobs[0]);
    mount({ startCreativeJob: start, fetchJob }); open(); await fillImage();
    fireEvent.click(screen.getByRole("button", { name: "Check the credit cost" }));
    await screen.findByRole("group", { name: "Credit cost" });
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Use 3 credits and generate/ }));
    expect(await screen.findByText(/Waiting in the queue/)).toBeInTheDocument();
    expect(await screen.findByText(/Being created/)).toBeInTheDocument();
    expect(await screen.findByText("Made by AI")).toBeInTheDocument();
    expect(screen.getByText(/3 credits used/)).toBeInTheDocument();
    expect(start.mock.calls[0][0].quote).toMatchObject({ quoteId: "q1" });
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.example.test/a.png");
  });
  it("a failed job says plainly nothing was charged and lets the customer start again", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j9");
    mount({ fetchJob: async () => job({ status: "failed", outputs: [], credits_charged: 0, failure: { code: "X", message: "The image could not be made." } }) }); open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be made\. No credits were used/);
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(await screen.findByLabelText("Brief")).toBeInTheDocument();
  });
  it("reload: a remembered job is fetched again by id", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j7");
    const fetchJob = vi.fn(async () => job({ job_id: "j7" })); mount({ fetchJob }); open();
    await screen.findByText("Made by AI"); expect(fetchJob.mock.calls[0][0]).toMatchObject({ jobId: "j7", tenantId: "t" });
  });
  it("approval needs an explicit second step and never claims publication", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j1");
    const approve = vi.fn(async () => ({})); let status = "ready_for_review";
    mount({ approveOutput: approve, fetchJob: async () => job({ status }) }); open();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(approve).not.toHaveBeenCalled();
    status = "approved";
    fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));
    expect(await screen.findByText(/Approved\. It has not been published/)).toBeInTheDocument();
    expect(approve.mock.calls[0][0]).toMatchObject({ jobId: "j1", outputId: "o1" });
  });
  it("a revision request starts following the new version", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j1");
    const revise = vi.fn(async () => ({ jobId: "j2" })); const fetchJob = vi.fn(async ({ jobId }) => jobId === "j2" ? job({ job_id: "j2", status: "running", outputs: [], credits_charged: null }) : job());
    mount({ requestRevision: revise, fetchJob }); open();
    fireEvent.change(await screen.findByLabelText("Ask for a change"), { target: { value: "Brighter please" } });
    fireEvent.click(screen.getByRole("button", { name: "Request this change" }));
    expect(await screen.findByText(/Being created/)).toBeInTheDocument();
    expect(window.localStorage.getItem("bg:creative-job:t:v1")).toBe("j2");
  });
  it("a session that ended during a call is reported upward", async () => {
    const ended = vi.fn(); mount({ fetchCapabilities: async () => { throw new CreativeError("Your session has ended.", { kind: "auth" }); } }, { onSessionEnded: ended }); open();
    await screen.findByRole("alert"); expect(ended).toHaveBeenCalled();
  });
  it("read-only members see results but no create, approve or change controls", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j1");
    mount({ fetchJob: async () => job() }, { readOnly: true }); open();
    await screen.findByText("Made by AI");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull(); expect(screen.queryByLabelText("Ask for a change")).toBeNull();
    expect(screen.getByText(/Only an owner or editor/)).toBeInTheDocument();
  });
  it("hybrid output says it uses the customer's own file", async () => {
    window.localStorage.setItem("bg:creative-job:t:v1", "j1");
    mount({ fetchJob: async () => job({ kind: "hybrid", outputs: [{ output_id: "o1", kind: "video", url: "https://cdn.example.test/v.mp4", provenance: { origin: "hybrid", supplied_asset_ids: ["a1"] } }] }) }); open();
    expect(await screen.findByText("Your media, edited with AI")).toBeInTheDocument(); expect(screen.getByText(/Uses 1 of your file\./)).toBeInTheDocument();
  });
});
