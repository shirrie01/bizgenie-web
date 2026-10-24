import { describe, expect, it } from "vitest";
import { BRAIN_SAVE_UNCONFIRMED, BrainSaveError, CONFLICT_CODE, FORBIDDEN_CODE, editableBrain, identityChanged, mergeBrainFields, putBrandBrain } from "./brainClient";

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
