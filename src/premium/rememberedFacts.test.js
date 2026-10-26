import { beforeEach, describe, expect, it, vi } from "vitest";
import { forget, recall, remember } from "./rememberedFacts";

const a = { tenantId: "t1", projectId: "p1" }; const b = { tenantId: "t2", projectId: "p1" };
beforeEach(() => window.localStorage.clear());
describe("remembered facts (browser convenience, never authority)", () => {
  it("round-trips per workspace, kind, campaign and variant", () => {
    remember(a, "schedule", "c1", "v1", { scheduleId: "s1" });
    expect(recall(a, "schedule", "c1", "v1")).toEqual({ scheduleId: "s1" });
    expect(recall(b, "schedule", "c1", "v1")).toBeNull(); expect(recall(a, "attempt", "c1", "v1")).toBeNull(); expect(recall(a, "schedule", "c1", "v2")).toBeNull();
  });
  it("forgets", () => { remember(a, "attempt", "c1", "v1", { attemptId: "x" }); forget(a, "attempt", "c1", "v1"); expect(recall(a, "attempt", "c1", "v1")).toBeNull(); });
  it("survives blocked storage and corrupt values by returning nothing", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(recall(a, "schedule", "c1", "v1")).toBeNull(); spy.mockRestore();
    window.localStorage.setItem("bg:facts:t1:p1:schedule:c1:v1", "{not json"); expect(recall(a, "schedule", "c1", "v1")).toBeNull();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); }); expect(remember(a, "schedule", "c1", "v1", {})).toBeNull(); set.mockRestore();
  });
});
