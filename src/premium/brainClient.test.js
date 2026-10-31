import { describe, expect, it } from "vitest";
import { BRAIN_LOAD_FAILED, BRAIN_SAVE_UNCONFIRMED, BRAIN_WORKSPACE_UNAVAILABLE, BrainLoadError, BrainSaveError, CONFLICT_CODE, FORBIDDEN_CODE, brainFormValues, changedBrainFields, describeBrainFailure, editableBrain, fetchBrandBrain, hasUntrimmedIdentity, identityChanged, mergeBrainFields, putBrandBrain, rebaseDraft } from "./brainClient";

// Shapes follow bizgenie-api PR #214 at 2319e5e8 (read from its code and report). MOCKED: no real API is called here.
const BRAIN = { brand_id: "b", project_id: "p", name: "Maison Aurelle", identity: { description: "A small-batch perfume house.  ", mission: "Scent" }, audience: { summary: "Gift buyers." }, commercial: { primary_cta: "Shop" }, metadata: { version: 3, status: "approved" } };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const run = (response) => putBrandBrain({ apiBaseUrl: "http://api.test", accessToken: "t", brandBrain: BRAIN, fetchImpl: async () => (typeof response === "function" ? response() : response) });
const failure = async (response) => { try { await run(response); } catch (e) { return e; } throw new Error("expected a failure"); };

describe("mergeBrainFields", () => {
  it("an owner (or an unknown role) can change name, description, audience and customer action", () => {
    const merged = mergeBrainFields(BRAIN, { name: "Maison Aurelle Paris", description: "New text", audience: "Collectors", cta: "Book" });
    expect(merged.name).toBe("Maison Aurelle Paris");
    expect(merged.identity).toEqual({ description: "New text", mission: "Scent" });
    expect(merged.audience.summary).toBe("Collectors");
    expect(merged.commercial.primary_cta).toBe("Book");
  });
  it("a known non-owner never changes the name or description, and repeats the stored values byte for byte", () => {
    const merged = mergeBrainFields(BRAIN, { name: "Other", description: "Other text", audience: "Collectors", cta: "Book" }, { canChangeIdentity: false });
    expect(merged.name).toBe(BRAIN.name);
    expect(merged.identity.description).toBe("A small-batch perfume house.  "); // trailing spaces preserved: the backend compares exactly
    expect(merged.identity).toBe(BRAIN.identity); // the very same section, not a trimmed copy
    expect(merged.audience.summary).toBe("Collectors");
    expect(merged.commercial.primary_cta).toBe("Book");
  });
  it("never modifies its input, and keeps every field it was not asked to change", () => {
    const before = JSON.stringify(BRAIN);
    const merged = mergeBrainFields(BRAIN, { audience: "x" }, { canChangeIdentity: false });
    expect(JSON.stringify(BRAIN)).toBe(before);
    expect(merged.identity.mission).toBe("Scent");
  });
  it("editableBrain strips ids and metadata, like every other Brand Brain save", () => {
    const body = editableBrain(BRAIN);
    for (const key of ["brand_id", "project_id", "metadata"]) expect(body).not.toHaveProperty(key);
    expect(body.name).toBe("Maison Aurelle");
  });
});

describe("identityChanged", () => {
  it("sees a changed name or description, and a removed description", () => {
    expect(identityChanged(BRAIN, { ...BRAIN })).toBe(false);
    expect(identityChanged(BRAIN, { ...BRAIN, name: "New" })).toBe(true);
    expect(identityChanged(BRAIN, { ...BRAIN, identity: { description: "New" } })).toBe(true);
    expect(identityChanged(BRAIN, { ...BRAIN, identity: { mission: "Scent" } })).toBe(true);
    expect(identityChanged(BRAIN, { ...BRAIN, audience: { summary: "Other" } })).toBe(false);
    expect(identityChanged(null, BRAIN)).toBe(false);
  });
});

describe("putBrandBrain", () => {
  it("sends the whole editable document with a bearer token and returns the saved Brand Brain", async () => {
    let seen;
    const result = await putBrandBrain({ apiBaseUrl: "http://api.test", accessToken: "tok", brandBrain: BRAIN, fetchImpl: async (url, o) => { seen = { url, o }; return res(200, { status: "ready", brand_brain: { ...BRAIN } }); } });
    expect(result.brand_brain.name).toBe("Maison Aurelle");
    expect(seen.url).toBe("http://api.test/customer/workspace/brand-brain");
    expect(seen.o.method).toBe("PUT");
    expect(seen.o.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(seen.o.body)).not.toHaveProperty("metadata");
  });
  it("403 is a refusal, whatever its cause (the code does not say which)", async () => {
    const e = await failure(res(403, { status: "failed", error: { code: FORBIDDEN_CODE, message: "Current workspace-owner authority is required for business identity changes" } }));
    expect(e).toBeInstanceOf(BrainSaveError);
    expect(e).toMatchObject({ kind: "forbidden", status: 403, code: FORBIDDEN_CODE });
    expect(e.message).toMatch(/nothing was saved/i);
  });
  it("409 BRAND_BRAIN_VERSION_CONFLICT is a conflict; another 409 is only a failure", async () => {
    expect(await failure(res(409, { error: { code: CONFLICT_CODE } }))).toMatchObject({ kind: "conflict", status: 409 });
    expect(await failure(res(409, { error: { code: "BRAND_PROJECT_CONFLICT" } }))).toMatchObject({ kind: "error" });
  });
  it("a 503, any 5xx, a dropped connection and a malformed success are all UNCONFIRMED, never 'not saved'", async () => {
    for (const status of [500, 503]) {
      const e = await failure(res(status, { status: "failed", error: { code: "BRAND_BRAIN_PERSISTENCE_UNAVAILABLE" } }));
      expect(e).toMatchObject({ kind: "unconfirmed", outcome: "unknown" });
      expect(e.message).toBe(BRAIN_SAVE_UNCONFIRMED);
    }
    expect(await failure(() => { throw new TypeError("network"); })).toMatchObject({ kind: "unconfirmed", code: "NETWORK" });
    expect(await failure(res(200, { status: "ready" }))).toMatchObject({ kind: "unconfirmed" });
    expect(BRAIN_SAVE_UNCONFIRMED).not.toMatch(/not saved/i);
  });
  it("401 asks for sign-in; 400 stays the plain failure sentence", async () => {
    expect(await failure(res(401, {}))).toMatchObject({ kind: "auth" });
    expect((await failure(res(400, { error: { code: "VALIDATION_ERROR" } }))).message).toBe("Brand Brain changes could not be saved yet.");
  });
});

describe("fetchBrandBrain (#214 Q3: a revoked workspace is a 400 with a trusted_scope detail on GET)", () => {
  const get = (response) => fetchBrandBrain({ apiBaseUrl: "http://api.test", accessToken: "t", fetchImpl: async () => (typeof response === "function" ? response() : response) });
  const fails = async (response) => { try { await get(response); } catch (e) { return e; } throw new Error("expected a failure"); };
  it("returns the Brand Brain on success", async () => { expect((await get(res(200, { status: "ready", brand_brain: BRAIN }))).brand_brain.name).toBe("Maison Aurelle"); });
  it("400 trusted_scope and 403 mean the workspace is not available, not an outage", async () => {
    const scope = { status: "failed", error: { code: "WORKSPACE_VALIDATION_ERROR", details: [{ path: "trusted_scope", code: "unauthorized", message: "x" }] } };
    for (const r of [res(400, scope), res(403, {})]) expect(await fails(r)).toMatchObject({ kind: "workspace_unavailable", code: "WORKSPACE_NOT_AUTHORIZED", message: BRAIN_WORKSPACE_UNAVAILABLE });
  });
  it("any other 400 (validation), 503, a network drop and a malformed answer are plain load failures; 401 asks for sign-in", async () => {
    expect(await fails(res(400, { error: { code: "VALIDATION_ERROR", details: [{ path: "name" }] } }))).toMatchObject({ kind: "unavailable", message: BRAIN_LOAD_FAILED });
    expect(await fails(res(503, {}))).toMatchObject({ kind: "unavailable" });
    expect(await fails(() => { throw new TypeError("net"); })).toMatchObject({ kind: "unavailable", code: "NETWORK" });
    expect(await fails(res(200, { status: "ready" }))).toMatchObject({ kind: "unavailable", code: "BAD_RESPONSE" });
    expect(await fails(res(401, {}))).toMatchObject({ kind: "auth" });
    expect(await fails(res(401, {}))).toBeInstanceOf(BrainLoadError);
  });
});

describe("edited fields only, and what follows a newer stored value", () => {
  const BASE = { businessName: "Maison Aurelle", description: "A perfume house.", audience: "Gift buyers.", cta: "Shop" };
  it("changedBrainFields sends only what differs from the last known stored value, trimmed, and never an emptied field", () => {
    expect(changedBrainFields({ ...BASE }, BASE)).toEqual({});
    expect(changedBrainFields({ ...BASE, cta: "  Book  " }, BASE)).toEqual({ cta: "Book" });
    expect(changedBrainFields({ ...BASE, businessName: "Maison Aurelle Paris", audience: "" }, BASE)).toEqual({ name: "Maison Aurelle Paris" });
    expect(changedBrainFields({ businessName: "X", description: "", audience: "", cta: "" }, null)).toEqual({ name: "X" });
  });
  it("rebaseDraft moves untouched fields to the newer stored value and keeps what was typed", () => {
    const draft = { ...BASE, cta: "Typed by me" };
    const next = { businessName: "Maison Aurelle", description: "Rewritten.", audience: "Newer audience.", cta: "Newer cta" };
    expect(rebaseDraft(draft, BASE, next)).toEqual({ businessName: "Maison Aurelle", description: "Rewritten.", audience: "Newer audience.", cta: "Typed by me" });
  });
  it("brainFormValues never presents a placeholder name or a bootstrap-seeded description as the customer's words", () => {
    const seeded = (t) => t.startsWith("Customer-provided website");
    const brain = { name: "BizGenie Workspace", identity: { description: "Customer-provided website or profile: https://x.test" }, audience: { summary: "A" }, commercial: { primary_cta: "C" } };
    expect(brainFormValues(brain, { isSeededDescription: seeded, placeholderName: true })).toEqual({ businessName: "", description: "", audience: "A", cta: "C" });
    expect(brainFormValues(null)).toEqual({ businessName: "", description: "", audience: "", cta: "" });
  });
  it("hasUntrimmedIdentity sees spaces at the edges of the stored name or description only", () => {
    expect(hasUntrimmedIdentity(BRAIN)).toBe(true); // BRAIN's description ends with two spaces
    expect(hasUntrimmedIdentity({ name: "A", identity: { description: "B" } })).toBe(false);
    expect(hasUntrimmedIdentity({ name: " A", identity: { description: "B" } })).toBe(true);
    expect(hasUntrimmedIdentity({ name: "A" })).toBe(false);
    expect(hasUntrimmedIdentity(null)).toBe(false);
  });
});

describe("describeBrainFailure", () => {
  it("tells each outcome apart and never says 'not saved' for an uncertain one", () => {
    expect(describeBrainFailure({ unconfirmed: true, message: BRAIN_SAVE_UNCONFIRMED })).toMatchObject({ kind: "unconfirmed", recheck: "brain" });
    expect(describeBrainFailure({ forbidden: true }).text).toMatch(/only the workspace owner/i);
    expect(describeBrainFailure({ forbidden: true, identityChanged: true }).text).toMatch(/changed by the workspace owner/i);
    expect(describeBrainFailure({ conflict: true, reloaded: true }).text).toMatch(/latest saved version has been loaded/i);
    expect(describeBrainFailure({ conflict: true, reloaded: false }).text).toMatch(/reload your brand brain/i);
    expect(describeBrainFailure({ workspaceUnavailable: true, message: "gone" })).toMatchObject({ chooser: true });
    expect(describeBrainFailure({ ownerMustFix: true, message: "spaces" })).toMatchObject({ kind: "error", text: "spaces" });
    expect(describeBrainFailure({ message: "plain" })).toEqual({ kind: "error", text: "plain" });
    expect(describeBrainFailure({ unconfirmed: true, message: BRAIN_SAVE_UNCONFIRMED }).text).not.toMatch(/not saved/i);
  });
});

describe("extended Brand Brain fields (BG-STUDIO-018-FE)", () => {
  const BRAIN = { brand_id: "b", project_id: "p", name: "Northgate", identity: { description: "We lease cars.", positioning: "Plain-spoken" }, voice: { tone: "warm", prohibited_terms: ["cheap"] }, audience: { summary: "SMEs" }, metadata: { version: 3, status: "approved" } };

  it("applies only edited fields to a copy, keeps everything else and never touches the name or description", async () => {
    const { mergeBrainFields } = await import("./brainClient");
    const out = mergeBrainFields(BRAIN, { extended: { tone: "calm", values: ["Honest", "Local"], competitor_names: ["Acme"] } }, { canChangeIdentity: false });
    expect(out.name).toBe("Northgate"); expect(out.identity).toEqual({ description: "We lease cars.", positioning: "Plain-spoken", values: ["Honest", "Local"] });
    expect(out.voice).toEqual({ tone: "calm", prohibited_terms: ["cheap"] }); expect(out.competitors).toEqual({ names: ["Acme"] });
    expect(BRAIN.voice.tone).toBe("warm"); expect(BRAIN.identity.values).toBeUndefined(); // the input is never modified
  });

  it("an empty value removes the field, and an emptied section is dropped; unknown ids and identity paths are ignored", async () => {
    const { mergeBrainFields } = await import("./brainClient");
    const out = mergeBrainFields(BRAIN, { extended: { prohibited_terms: [], tone: "", name: "Hacked", description: "Hacked", "identity.description": "Hacked", bogus: "x" } });
    expect(out.voice).toBeUndefined(); expect(out.name).toBe("Northgate"); expect(out.identity.description).toBe("We lease cars.");
    expect(JSON.stringify(out)).not.toMatch(/Hacked|bogus/);
  });

  it("shows lists one per line, trims lines, and detects only real changes", async () => {
    const { extendedFormValues, changedExtended, extendedValue, EXTENDED_FIELDS } = await import("./brainClient");
    const base = extendedFormValues({ ...BRAIN, voice: { prohibited_terms: ["cheap", "free"] } });
    expect(base.prohibited_terms).toBe("cheap\nfree");
    expect(changedExtended({ ...base }, base)).toEqual({});
    expect(changedExtended({ ...base, prohibited_terms: "cheap\r\n free \n\n" }, base)).toEqual({}); // same items, different spacing: not a change
    expect(changedExtended({ ...base, prohibited_terms: "cheap" }, base)).toEqual({ prohibited_terms: ["cheap"] });
    expect(changedExtended({ ...base, tone: "  " }, base)).toEqual({});
    expect(extendedValue(EXTENDED_FIELDS.find((f) => f.id === "tone"), "  calm ")).toBe("calm");
  });

  it("enforces the backend's limits before anything is sent", async () => {
    const { validateExtended } = await import("./brainClient");
    const lines = (n, len = 5) => Array.from({ length: n }, () => "x".repeat(len)).join("\n");
    expect(validateExtended({ tone: "x".repeat(2001) }, ["tone"]).tone).toMatch(/2000 characters or fewer/);
    expect(validateExtended({ values: lines(21) }, ["values"]).values).toMatch(/at most 20 lines/);
    expect(validateExtended({ values: lines(2, 301) }, ["values"]).values).toMatch(/300 characters/);
    expect(validateExtended({ approved_claims: lines(13) }, ["approved_claims"]).approved_claims).toMatch(/at most 12 lines/);
    expect(validateExtended({ approved_claims: lines(2, 201) }, ["approved_claims"]).approved_claims).toMatch(/200 characters/);
    expect(validateExtended({ values: lines(20, 300), approved_claims: lines(12, 200), tone: "x".repeat(2000) }, ["values", "approved_claims", "tone"])).toEqual({});
  });
});
