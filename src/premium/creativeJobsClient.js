// Creative jobs (BG-STUDIO-025-FE): the read, attach and cancel side of a confirmed generation, on the REAL routes of bizgenie-api #218 (9346055)
// src/generation-quotes/{jobsRouter,jobs}.js, extended compatibly by draft #219 (44f849c: strategy_plan outputs, STAGE_NOT_ATTACHABLE, content_dna).
// Off with the rest of customer creative (`isCustomerMediaApiEnabled`). The backend answers 503 CREATIVE_JOBS_UNAVAILABLE when the mount is not configured.
//   GET  /customer/creative-jobs?tenant_id&project_id&brand_id[&limit&cursor]  -> { contract_version:"creative-job-list.v1", jobs:[{ job_id, quote_id, campaign_id, variant_id,
//                                                                                   execution_class, state, content_dna|null, error_code|null, created_at }], next_cursor|null }
//   GET  /customer/creative-jobs/:jobId?scope                                   -> creative-job.v1 (below)
//   POST /customer/creative-jobs/:jobId/attach { scope }                        -> creative-job.v1   (owner only; idempotent; 422 STAGE_NOT_ATTACHABLE for a strategy stage;
//                                                                                   409 RESULT_NOT_READY until succeeded)
//   POST /customer/creative-jobs/:jobId/cancel  { scope }                       -> cancel result       (owner who made it, queued or claimed only)
//   creative-job.v1 = { job_id, quote_id, kind: text|image|video|hybrid, execution_class, state, content_dna, error_code, created_at, campaign_id, variant_id,
//     outputs: [ {output_type:"text", content, provenance} | {output_type:"strategy_plan", strategy, provenance} | {asset_id, mime_type, media_kind, provenance} ],
//     association: null | { campaign_id, variant_id, revision_id, campaign_version, current, current_campaign_version, approval_status: approved|published|not_approved },
//     preview: null | { metadata_path, revision_id, expected_campaign_version, media_paths:[{asset_id,path}] }, can_cancel, retry_guidance }
// Rules: only a text or asset output can be attached; a strategy plan is a plan, never media, never attachable. "Finished" is not approved and not published.
// An association counts only while `current` is true (a newer revision replaces it). Nothing here follows a server-supplied URL: previews use the existing
// revision-scoped authenticated delivery (mediaPreviewClient).
export const CONTRACT_VERSION = "creative-job.v1";
export const LIST_VERSION = "creative-job-list.v1";
const JOB_STATES = ["queued", "claimed", "calling", "recovery_required", "succeeded", "failed", "cancelled"];
export const KINDS = ["text", "image", "video", "hybrid"];

export class JobError extends Error {
  constructor(message, { kind = "error", status = 0, code = "" } = {}) { super(message); this.name = "JobError"; this.kind = kind; this.status = status; this.code = code; }
}
const str = (v) => typeof v === "string" && v.trim().length > 0;
const obj = (v) => v && typeof v === "object" && !Array.isArray(v);
const bad = () => new JobError("The server's answer was not in the expected form, so nothing is shown from it.", { kind: "invalid", code: "BAD_RESPONSE" });
const q = (scope, extra = {}) => new URLSearchParams({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId, ...extra });
const body = (scope) => ({ tenant_id: scope.tenantId, project_id: scope.projectId, brand_id: scope.brandId });

const textOf = (c) => ({ title: str(c.title) ? c.title : "", body: typeof c.body === "string" ? c.body : "", caption: str(c.caption) ? c.caption : "", altText: str(c.alt_text) ? c.alt_text : "" });
const strategyOf = (s) => {
  const sel = obj(s.selected_strategy) ? s.selected_strategy : null; if (!sel || !str(sel.angle)) return null;
  const list = Array.isArray(s.candidates) ? s.candidates.filter((c) => obj(c) && str(c.angle)).map((c) => c.angle) : [];
  const ev = obj(s.selection_evidence) ? s.selection_evidence : {};
  return { angle: sel.angle, specificity: str(sel.specificity) ? sel.specificity : "", execution: str(sel.platform_execution) ? sel.platform_execution : "", candidates: list, criteria: Array.isArray(ev.criteria) ? ev.criteria.filter(str) : [], rationale: str(ev.rationale) ? ev.rationale : "" };
};
// One output, classified by what it IS. Unknown shapes are dropped and counted, never guessed into media.
export function normaliseOutput(o) {
  if (!obj(o)) return null;
  const origin = obj(o.provenance) && str(o.provenance.origin) ? o.provenance.origin : "";
  if (o.output_type === "text" && obj(o.content)) return { type: "text", ...textOf(o.content), attachable: true, origin };
  if (o.output_type === "strategy_plan" && obj(o.strategy)) { const s = strategyOf(o.strategy); return s ? { type: "strategy_plan", ...s, attachable: false, origin } : null; }
  if (str(o.asset_id) && ["image", "video"].includes(o.media_kind) && str(o.mime_type)) return { type: "media", assetId: o.asset_id, kind: o.media_kind, mime: o.mime_type, attachable: true, origin };
  return null;
}
export function normaliseJob(b) {
  if (!obj(b) || b.contract_version !== CONTRACT_VERSION || !str(b.job_id) || !str(b.quote_id) || !JOB_STATES.includes(b.state) || !KINDS.includes(b.kind) || !Array.isArray(b.outputs)) throw bad();
  const outputs = b.outputs.map(normaliseOutput).filter(Boolean);
  const a = obj(b.association) ? b.association : null;
  const association = a && str(a.revision_id) && str(a.variant_id) ? { revisionId: a.revision_id, variantId: a.variant_id, campaignId: str(a.campaign_id) ? a.campaign_id : "", current: a.current === true, campaignVersion: Number.isInteger(a.campaign_version) ? a.campaign_version : null, approval: ["approved", "published", "not_approved"].includes(a.approval_status) ? a.approval_status : "not_approved" } : null;
  return {
    id: b.job_id, quoteId: b.quote_id, kind: b.kind, executionClass: str(b.execution_class) ? b.execution_class : "", state: b.state, errorCode: str(b.error_code) ? b.error_code : "", createdAt: Number.isFinite(Date.parse(b.created_at)) ? b.created_at : null,
    campaignId: str(b.campaign_id) ? b.campaign_id : "", variantId: str(b.variant_id) ? b.variant_id : "", outputs, skippedOutputs: b.outputs.length - outputs.length, association,
    canCancel: b.can_cancel === true, retry: b.retry_guidance === "reconcile_do_not_resubmit" ? "reconcile" : b.retry_guidance === "new_quote_required" ? "new_quote" : "",
    // Attachable only when finished, not yet attached, and at least one output really is text or media. A strategy plan alone is never attachable.
    canAttach: b.state === "succeeded" && !association && outputs.some((x) => x.attachable),
  };
}
export function normaliseJobList(b) {
  if (!obj(b) || b.contract_version !== LIST_VERSION || !Array.isArray(b.jobs)) throw bad();
  const jobs = b.jobs.filter((j) => obj(j) && str(j.job_id) && JOB_STATES.includes(j.state)).map((j) => ({ id: j.job_id, quoteId: str(j.quote_id) ? j.quote_id : "", campaignId: str(j.campaign_id) ? j.campaign_id : "", variantId: str(j.variant_id) ? j.variant_id : "", executionClass: str(j.execution_class) ? j.execution_class : "", state: j.state, errorCode: str(j.error_code) ? j.error_code : "", createdAt: Number.isFinite(Date.parse(j.created_at)) ? j.created_at : null }));
  return { jobs, skipped: b.jobs.length - jobs.length, nextCursor: str(b.next_cursor) ? b.next_cursor : null };
}

const CODES = {
  STAGE_NOT_ATTACHABLE: ["stage", "A strategy plan is a plan, not creative, so it cannot be attached to a post."],
  RESULT_NOT_READY: ["not_ready", "The result is not finished yet, so it cannot be attached."],
  JOB_CONTEXT_UNAVAILABLE: ["unavailable", "This result cannot be attached because the post it was made for is no longer available."],
  VERSION_CONFLICT: ["conflict", "The campaign changed since this was made. Reload it, then try again. Nothing was attached."],
  EXECUTION_ALREADY_STARTED: ["started", "This has already started, so it can no longer be cancelled."],
};
async function call(fetchImpl, url, options, what) {
  let res; try { res = await fetchImpl(url, options); } catch { throw new JobError(`${what} could not be done because the connection failed.${options.method === "POST" ? " Check the result before trying again; nothing is done twice." : ""}`, { kind: options.method === "POST" ? "unconfirmed" : "network" }); }
  let json = null; try { json = await res.json(); } catch { json = null; }
  if (res.ok) return json;
  const code = json && json.error && typeof json.error.code === "string" ? json.error.code : "";
  if (res.status === 401) throw new JobError("Your session has ended. Sign in again to continue.", { kind: "auth", status: 401, code });
  if (CODES[code]) throw new JobError(CODES[code][1], { kind: CODES[code][0], status: res.status, code });
  if (res.status === 404) throw new JobError("That is not available to you.", { kind: "unavailable", status: 404, code });
  if (res.status === 503) throw new JobError(`${what} is not switched on for this workspace yet.`, { kind: "unavailable", status: 503, code });
  if (res.status === 409) throw new JobError("That changed in the meantime. Reload and try again. Nothing was changed.", { kind: "conflict", status: 409, code });
  if (res.status >= 500) throw new JobError(`${what} may not have completed because the service had a problem. Check the result before trying again.`, { kind: options.method === "POST" ? "unconfirmed" : "error", status: res.status, code });
  throw new JobError(`${what} could not be done yet.`, { kind: "error", status: res.status, code });
}
const H = (t) => ({ authorization: `Bearer ${t}` }); const HJ = (t) => ({ ...H(t), "content-type": "application/json" });
const f0 = (...a) => fetch(...a);
export const fetchCreativeJobs = async ({ apiBaseUrl, accessToken, scope, cursor, limit, fetchImpl = f0 }) => normaliseJobList(await call(fetchImpl, `${apiBaseUrl}/customer/creative-jobs?${q(scope, { ...(limit ? { limit: String(limit) } : {}), ...(cursor ? { cursor } : {}) })}`, { headers: H(accessToken) }, "The list of results"));
export const fetchCreativeJob = async ({ apiBaseUrl, accessToken, scope, jobId, fetchImpl = f0 }) => normaliseJob(await call(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}?${q(scope)}`, { headers: H(accessToken) }, "This result"));
export const attachCreativeJob = async ({ apiBaseUrl, accessToken, scope, jobId, fetchImpl = f0 }) => {
  const job = normaliseJob(await call(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}/attach`, { method: "POST", headers: HJ(accessToken), body: JSON.stringify(body(scope)) }, "Attaching"));
  if (!job.association) throw new JobError("The attachment could not be confirmed. Check the result before trying again.", { kind: "unconfirmed" });
  return job;
};
export const cancelCreativeJob = async ({ apiBaseUrl, accessToken, scope, jobId, fetchImpl = f0 }) => { await call(fetchImpl, `${apiBaseUrl}/customer/creative-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: HJ(accessToken), body: JSON.stringify(body(scope)) }, "Cancelling"); return { jobId }; };
