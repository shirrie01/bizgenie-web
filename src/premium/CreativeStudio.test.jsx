import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CreativeStudio from "./CreativeStudio";
import { CreativeError, normaliseRecord } from "./creativeProductionClient";

const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const campaign = { campaign_id: "c1", version: 2 }; const variant = { variant_id: "v1", platform: "instagram" };
const rec = (kind, status, extra = {}) => normaliseRecord(kind, { status, execution_id: "exec_1", generation_id: "gen_1", [kind === "video" ? "video" : "media"]: status === "completed" ? { asset: { location: "gs://private/x" }, approval_status: "pending", completed_at: "2026-10-26T10:00:00Z" } : { approval_status: "pending" }, ...extra });
const preview = (o = {}) => ({ binding: false, quoteId: null, executionClass: "image.normal", credits: 4, kind: "current", maxCredits: 4, authorisedCredits: null, availableCredits: 20, sufficient: true, affordability: "within_limit", expiresAt: Date.now() + 600000, ...o });
const mount = (api, props = {}) => render(<CreativeStudio enabled session={session} scope={scope} campaign={campaign} variant={variant} topic="Lease offer post" contentItemId="i1" api={{ requestCostCheck: async () => preview(), ...api }} pollMs={5} {...props} />);
const open = () => fireEvent.click(screen.getByText("Create an image or video for this post"));
beforeEach(() => { try { window.localStorage.clear(); } catch {} vi.stubEnv("VITE_CREDIT_PREVIEW_API", "true"); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

async function fillImage() {
  fireEvent.click(screen.getByLabelText("Image"));
  fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "1:1" } });
  fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A calm product shot" } });
}
const confirm = async () => { fireEvent.click(screen.getByRole("button", { name: "Check the credit cost" })); await screen.findByRole("group", { name: "Credit cost" }); fireEvent.click(screen.getByRole("button", { name: "Generate now" })); };

describe("CreativeStudio", () => {
  it("gate off: says it is not available, names why hybrid is unavailable, calls nothing", () => {
    const f = vi.fn(); render(<CreativeStudio enabled={false} session={session} scope={scope} campaign={campaign} variant={variant} api={{ startImage: f, startVideo: f }} />);
    expect(screen.getByText(/images and videos is not available in BizGenie yet/i)).toBeInTheDocument(); expect(screen.getByText(/Hybrid .* is not available yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("offers only image and video; hybrid is explained, never a choice", () => {
    mount({}); open();
    expect(screen.getByLabelText("Image")).toBeInTheDocument(); expect(screen.getByLabelText("Video")).toBeInTheDocument();
    expect(screen.queryByLabelText(/hybrid/i)).toBeNull(); expect(screen.getByText(/own photos or videos combined with AI/)).toBeInTheDocument();
  });
  it("tells the customer what is still needed and keeps the cost check unavailable until it is complete", () => {
    mount({}); open(); fireEvent.click(screen.getByLabelText("Image"));
    expect(screen.getByRole("list", { name: "What is still needed" })).toHaveTextContent(/Choose a shape/);
    expect(screen.getByRole("button", { name: "Check the credit cost" })).toBeDisabled();
  });
  it("video offers the server's lengths and qualities", () => {
    mount({}); open(); fireEvent.click(screen.getByLabelText("Video"));
    expect(Array.from(screen.getByLabelText("Length").options).map((o) => o.value)).toEqual(["4", "6", "8"]);
    expect(Array.from(screen.getByLabelText("Shape").options).map((o) => o.value)).toEqual(["", "16:9", "9:16"]);
  });
  it("checks the cost (as the right execution class) before anything starts, then starts once", async () => {
    const start = vi.fn(async () => rec("image", "completed")); const cost = vi.fn(async () => preview());
    mount({ startImage: start, requestCostCheck: cost }); open(); await fillImage();
    fireEvent.click(screen.getByRole("button", { name: "Check the credit cost" })); await screen.findByRole("group", { name: "Credit cost" });
    expect(cost.mock.calls[0][0]).toMatchObject({ executionClass: "image.normal" }); expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate now" }));
    expect(await screen.findByText("Image created")).toBeInTheDocument(); expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][0]).toMatchObject({ topic: "Lease offer post", contentItemId: "i1", platform: "instagram", ids: { executionId: expect.stringMatching(/^exec_/), generationId: expect.stringMatching(/^gen_/) } });
  });
  it("a finished creative is never displayed or approved here: no image element, no private address, an honest explanation", async () => {
    mount({ startImage: async () => rec("image", "completed") }); open(); await fillImage(); await confirm();
    expect(await screen.findByText(/stored privately/)).toBeInTheDocument(); expect(screen.queryByRole("img")).toBeNull(); expect(document.body.textContent).not.toMatch(/gs:\/\//);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull(); expect(screen.getByText(/not scheduled or published/)).toBeInTheDocument();
  });
  it("a refused start (no credits) explains that nothing was charged and a fresh attempt gets fresh ids", async () => {
    const start = vi.fn().mockRejectedValueOnce(new CreativeError("You do not have enough credits for this. Nothing was started and nothing was charged.", { kind: "credits" })).mockResolvedValueOnce(rec("image", "completed"));
    mount({ startImage: start }); open(); await fillImage(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(/nothing was charged/i);
    fireEvent.click(screen.getByRole("button", { name: /check the cost again/i })); await screen.findByRole("group", { name: "Credit cost" }); fireEvent.click(screen.getByRole("button", { name: "Generate now" }));
    await screen.findByText("Image created"); expect(start.mock.calls[0][0].ids.generationId).not.toBe(start.mock.calls[1][0].ids.generationId);
  });
  it("an unconfirmed start (connection lost) is retried with the SAME ids, so it cannot run twice", async () => {
    const start = vi.fn().mockRejectedValueOnce(new CreativeError("The request may or may not have been received.", { kind: "unconfirmed" })).mockResolvedValueOnce(rec("image", "completed"));
    mount({ startImage: start }); open(); await fillImage(); await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(/may or may not/);
    fireEvent.click(screen.getByRole("button", { name: /try again|check the cost again/i }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Credit cost" }) || screen.queryByText("Image created")).toBeTruthy());
    if (!screen.queryByText("Image created")) { fireEvent.click(screen.getByRole("button", { name: "Generate now" })); }
    await screen.findByText("Image created");
    expect(start.mock.calls[0][0].ids).toEqual(start.mock.calls[1][0].ids);
  });
  it("video: follows progress to completion and says credits are used only on success", async () => {
    const seq = [rec("video", "processing"), rec("video", "completed")];
    const start = vi.fn(async () => rec("video", "submitted")); const read = vi.fn(async () => rec("video", "submitted")); const poll = vi.fn(async () => (seq.length > 1 ? seq.shift() : seq[0]));
    mount({ startVideo: start, fetchVideo: read, pollVideo: poll, requestCostCheck: async () => preview({ executionClass: "video.normal" }) }); open();
    fireEvent.click(screen.getByLabelText("Video")); fireEvent.change(screen.getByLabelText("Shape"), { target: { value: "9:16" } }); fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "A short reveal" } });
    await confirm();
    expect(await screen.findByText(/Being made\. Credits are used only if it succeeds/)).toBeInTheDocument();
    expect(await screen.findByText("Video created")).toBeInTheDocument(); expect(poll.mock.calls[0][0]).toMatchObject({ generationId: expect.stringMatching(/^gen_/) }); expect(poll.mock.calls.length).toBeGreaterThanOrEqual(2); // only polling moves a video on
  });
  it("reload: a remembered video is read again by its id", async () => {
    window.localStorage.setItem("bg:creative:t:v1", JSON.stringify({ kind: "video", ids: { executionId: "exec_9", generationId: "gen_9" } }));
    const read = vi.fn(async () => rec("video", "completed")); mount({ fetchVideo: read }); open();
    await screen.findByText("Video created"); expect(read.mock.calls[0][0]).toMatchObject({ generationId: "gen_9" });
  });
  it("a failed video says it was not charged and offers a fresh start", async () => {
    window.localStorage.setItem("bg:creative:t:v1", JSON.stringify({ kind: "video", ids: { executionId: "exec_9", generationId: "gen_9" } }));
    mount({ fetchVideo: async () => rec("video", "failed") }); open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/not charged for a failed attempt/); fireEvent.click(screen.getByRole("button", { name: "Start again" })); expect(await screen.findByLabelText("Image")).toBeInTheDocument();
  });
  it("a session that ended during a call is reported upward", async () => {
    const ended = vi.fn(); window.localStorage.setItem("bg:creative:t:v1", JSON.stringify({ kind: "video", ids: { executionId: "exec_9", generationId: "gen_9" } }));
    mount({ fetchVideo: async () => { throw new CreativeError("Your session has ended.", { kind: "auth" }); } }, { onSessionEnded: ended }); open();
    await screen.findByRole("alert"); expect(ended).toHaveBeenCalled();
  });
  it("read-only members see no create controls", () => { mount({}, { readOnly: true }); open(); expect(screen.queryByLabelText("Image")).toBeNull(); expect(screen.getByText(/Only an owner or editor/)).toBeInTheDocument(); });
  it("after a reload with an unknown image outcome, 'send the same request again' replays the SAME ids and brief", async () => {
    const stored = { kind: "image", ids: { executionId: "exec_5", generationId: "gen_5" }, brief: { kind: "image", aspectRatio: "1:1", text: "A calm product shot", duration: 8, quality: "normal" } };
    window.localStorage.setItem("bg:creative:t:v1", JSON.stringify(stored));
    const start = vi.fn(async () => rec("image", "completed")); mount({ startImage: start }); open();
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot run twice or charge you twice/);
    fireEvent.click(screen.getByRole("button", { name: "Send the same request again" }));
    await screen.findByText("Image created");
    expect(start.mock.calls[0][0].ids).toEqual(stored.ids); expect(start.mock.calls[0][0].brief.text).toBe("A calm product shot");
  });
});
