// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMeasurement, measurementAllowed } from "../assets/measure.js";
import { validateEvents } from "../dev/lead-stub.mjs";

const make = (over = {}) => { const sent = []; const m = createMeasurement({ url: "https://api.test/e", attribution: { utm_source: "x" }, nav: {}, send: (b) => sent.push(JSON.parse(b)), pagePath: "/", ...over }); return { m, sent }; };

describe("measurement policy", () => {
  it("does nothing without an events URL", () => { const { m, sent } = make({ url: "" }); expect(m.enabled).toBe(false); m.pageView(); m.touch("name"); m.abandon(); expect(sent).toEqual([]); });
  it("honours Do Not Track and Global Privacy Control", () => {
    expect(measurementAllowed({ doNotTrack: "1" })).toBe(false); expect(measurementAllowed({ globalPrivacyControl: true })).toBe(false); expect(measurementAllowed({})).toBe(true);
    const { m, sent } = make({ nav: { globalPrivacyControl: true } }); m.pageView(); expect(sent).toEqual([]);
  });
  it("sends only fixed event types; every payload passes the contract validator", () => {
    const { m, sent } = make(); m.pageView(); m.formView(); m.touch("name", "early_access"); m.fieldError("email", "invalid"); m.attempt(); m.failure("network"); m.success();
    expect(sent.map((s) => s.events[0].type)).toEqual(["page_view", "form_view", "form_start", "field_error", "submit_attempt", "submit_failure", "submit_success"]);
    for (const s of sent) expect(validateEvents(s).errors).toBeUndefined();
  });
  it("never carries a value, an email or free text", () => {
    const { m, sent } = make(); m.touch("email", "founding_customer"); m.fieldError("email", "invalid");
    m.fieldError("a@b.com", "x y z"); m.fieldError("name", "Ada Lovelace"); // would-be leaks are dropped, not sent
    const text = JSON.stringify(sent); expect(text).not.toMatch(/a@b\.com|Ada|Lovelace|x y z/);
  });
  it("counts abandonment once, only after a start and never after success", () => {
    const a = make(); expect(a.m.abandon()).toBe(false); a.m.touch("name"); expect(a.m.abandon()).toBe(true); expect(a.m.abandon()).toBe(false);
    const b = make(); b.m.touch("name"); b.m.success(); expect(b.m.abandon()).toBe(false);
    expect(a.sent.at(-1).events[0]).toMatchObject({ type: "form_abandon", field: "name" });
  });
  it("uses a per-visit random id held in memory only", () => { const a = make(); const b = make(); a.m.pageView(); b.m.pageView(); expect(a.sent[0].visit).toMatch(/^[0-9a-f-]{36}$/); expect(a.sent[0].visit).not.toBe(b.sent[0].visit); });
});
