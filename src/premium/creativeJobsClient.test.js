// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { JobError, attachCreativeJob, cancelCreativeJob, fetchCreativeJob, fetchCreativeJobs, normaliseJob, normaliseJobList, normaliseOutput } from "./creativeJobsClient";

// FIXTURE tests of the adapter against creative-job.v1 / creative-job-list.v1 shapes; qa/integration/creativeJobs checks the same shapes against the real backend.
const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const reply = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
const ASSET = "44444444-4444-4444-8444-444444444444";
const job = (o = {}) => ({ contract_version: "creative-job.v1", job_id: "j1", quote_id: "q1", kind: "image", execution_class: "image.normal", state: "succeeded", content_dna: null, error_code: null, created_at: "2026-10-27T10:00:00Z", campaign_id: "c1", variant_id: "v1", outputs: [{ asset_id: ASSET, mime_type: "image/png", media_kind: "image", provenance: { origin: "ai_generated" } }], association: null, preview: null, can_cancel: false, retry_guidance: null, ...o });
const strategy = { selected_strategy: { angle: "Checklist demo", evidence_anchors: ["EA001"], specificity: "Exact objective", platform_execution: "Carousel" }, candidates: [{ angle: "Checklist demo" }, { angle: "Comparison" }], selection_evidence: { selected_candidate_index: 0, criteria: ["brand_truth"], rationale: "Fits the brand" } };

describe("outputs are classified by what they are", () => {
  it("text and asset outputs are attachable; a strategy plan never is and never becomes media", () => {
    expect(normaliseOutput({ output_type: "text", content: { title: null, body: "Hello", caption: null, alt_text: null, asset_refs: [] }, provenance: { origin: "ai_generated" } })).toMatchObject({ type: "text", body: "Hello", attachable: true });
    expect(normaliseOutput({ asset_id: ASSET, mime_type: "video/mp4", media_kind: "video" })).toMatchObject({ type: "media", kind: "video", attachable: true });
    const s = normaliseOutput({ output_type: "strategy_plan", strategy });
    expect(s).toMatchObject({ type: "strategy_plan", angle: "Checklist demo", attachable: false, candidates: ["Checklist demo", "Comparison"] }); expect(s).not.toHaveProperty("assetId");
  });
  it.each([[{ output_type: "strategy_plan", strategy: {} }], [{ asset_id: ASSET, media_kind: "audio", mime_type: "audio/mp3" }], [{ output_type: "text" }], [null], ["x"]])("drops %j instead of guessing", (o) => expect(normaliseOutput(o)).toBeNull());
});
describe("job", () => {
  it("a finished unattached image can be attached; once attached it cannot, and the version/approval is only what the server says", () => {
    expect(normaliseJob(job())).toMatchObject({ id: "j1", state: "succeeded", canAttach: true, association: null });
    const att = normaliseJob(job({ association: { campaign_id: "c1", variant_id: "v1", revision_id: "r1", campaign_version: 5, current: true, current_campaign_version: 5, approval_status: "approved" } }));
    expect(att.canAttach).toBe(false); expect(att.association).toMatchObject({ current: true, approval: "approved" });
    expect(normaliseJob(job({ association: { variant_id: "v1", revision_id: "r1", current: false, approval_status: "approved" } })).association.current).toBe(false);
  });
  it("a strategy-plan-only job is NOT attachable even though it succeeded", () => {
    const j = normaliseJob(job({ kind: "text", execution_class: "text.standard", outputs: [{ output_type: "strategy_plan", strategy }] })); expect(j.canAttach).toBe(false); expect(j.outputs[0].type).toBe("strategy_plan");
  });
  it("running, failed and recovery states carry honest guidance; unreadable outputs are counted", () => {
    expect(normaliseJob(job({ state: "queued", outputs: [], can_cancel: true })).canCancel).toBe(true);
    expect(normaliseJob(job({ state: "failed", outputs: [], retry_guidance: "new_quote_required", error_code: "PROVIDER" })).retry).toBe("new_quote");
    expect(normaliseJob(job({ state: "recovery_required", outputs: [], retry_guidance: "reconcile_do_not_resubmit" })).retry).toBe("reconcile");
    expect(normaliseJob(job({ outputs: [{ junk: 1 }, { asset_id: ASSET, mime_type: "image/png", media_kind: "image" }] })).skippedOutputs).toBe(1);
  });
  it.each([[null], [{}], [job({ contract_version: "x" })], [job({ state: "weird" })], [job({ outputs: "x" })], [job({ kind: "audio" })]])("refuses %j", (b) => expect(() => normaliseJob(b)).toThrow(JobError));
  it("list needs its contract version and counts unreadable rows", () => {
    const r = normaliseJobList({ contract_version: "creative-job-list.v1", jobs: [{ job_id: "j1", quote_id: "q", campaign_id: "c", variant_id: "v", execution_class: "image.normal", state: "succeeded", created_at: "2026-10-27T10:00:00Z" }, { job_id: "j2", state: "weird" }], next_cursor: "n" });
    expect(r.jobs).toHaveLength(1); expect(r.skipped).toBe(1); expect(r.nextCursor).toBe("n"); expect(() => normaliseJobList({ contract_version: "x", jobs: [] })).toThrow(JobError);
  });
});
describe("requests", () => {
  it("use the real routes with scope and bearer", async () => {
    const f = reply(200, { contract_version: "creative-job-list.v1", jobs: [], next_cursor: null }); await fetchCreativeJobs({ apiBaseUrl: "http://a", accessToken: "tk", scope, fetchImpl: f });
    expect(f.mock.calls[0][0]).toBe("http://a/customer/creative-jobs?tenant_id=t1&project_id=p1&brand_id=b1"); expect(f.mock.calls[0][1].headers.authorization).toBe("Bearer tk");
    const g = reply(200, job()); await fetchCreativeJob({ apiBaseUrl: "http://a", accessToken: "tk", scope, jobId: "j 1", fetchImpl: g }); expect(g.mock.calls[0][0]).toBe("http://a/customer/creative-jobs/j%201?tenant_id=t1&project_id=p1&brand_id=b1");
  });
  it("attach posts only the scope and needs an association back; cancel posts the scope", async () => {
    const f = reply(200, job({ association: { variant_id: "v1", revision_id: "r1", current: true, approval_status: "not_approved" } }));
    expect((await attachCreativeJob({ apiBaseUrl: "http://a", accessToken: "t", scope, jobId: "j1", fetchImpl: f })).association.current).toBe(true);
    expect(f.mock.calls[0][0]).toBe("http://a/customer/creative-jobs/j1/attach"); expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tenant_id: "t1", project_id: "p1", brand_id: "b1" });
    await expect(attachCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, jobId: "j1", fetchImpl: reply(200, job()) })).rejects.toMatchObject({ kind: "unconfirmed" });
    const c = reply(200, { quote_id: "q", status: "cancelled", charged: false }); await cancelCreativeJob({ apiBaseUrl: "http://a", accessToken: "t", scope, jobId: "j1", fetchImpl: c }); expect(c.mock.calls[0][0]).toBe("http://a/customer/creative-jobs/j1/cancel");
  });
  it.each([[401, {}, "auth"], [404, {}, "unavailable"], [503, { error: { code: "CREATIVE_JOBS_UNAVAILABLE" } }, "unavailable"], [422, { error: { code: "STAGE_NOT_ATTACHABLE" } }, "stage"], [409, { error: { code: "RESULT_NOT_READY" } }, "not_ready"], [409, { error: { code: "VERSION_CONFLICT" } }, "conflict"], [500, {}, "unconfirmed"]])("attach %s %j -> %s", async (s, b, kind) => { await expect(attachCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, jobId: "j", fetchImpl: reply(s, b) })).rejects.toMatchObject({ kind }); });
  it("a lost connection on a write is unconfirmed, on a read it is a network error", async () => {
    const lost = vi.fn().mockRejectedValue(new Error("x"));
    await expect(attachCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, jobId: "j", fetchImpl: lost })).rejects.toMatchObject({ kind: "unconfirmed" });
    await expect(fetchCreativeJob({ apiBaseUrl: "h", accessToken: "t", scope, jobId: "j", fetchImpl: lost })).rejects.toMatchObject({ kind: "network" });
  });
});
