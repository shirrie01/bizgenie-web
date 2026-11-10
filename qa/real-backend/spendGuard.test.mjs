// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSpendGuard, parseUsd, DEFAULT_WORST_CASE } from "./spendGuard.mjs";

it("a USD ceiling is mandatory and must be a sane positive number", () => {
  for (const bad of [undefined, "", "0", "-1", "abc", "1001", NaN, null]) expect(() => createSpendGuard({ approvedUsd: bad })).toThrow(/approved USD ceiling/);
  expect(parseUsd("5")).toBe(5); expect(parseUsd("4.999")).toBe(5);
});

it("the pessimistic worst case for one image and one 4 s video is 1.85 USD, so a 5 USD ceiling admits the approved pair plus one retry and refuses anything beyond", () => {
  const g = createSpendGuard({ approvedUsd: 5 });
  expect(g.price("video.normal")).toBe(1.6); expect(g.price("image.normal")).toBe(0.25);
  expect(g.admit("image.normal")).toEqual({ allow: true, reason: "OK", committed: 0.25, projected: 0.25 });
  expect(g.admit("video.normal").allow).toBe(true);
  expect(g.snapshot().committed).toBe(1.85);
  expect(g.admit("video.normal").allow).toBe(true);   // a retry of the video still fits under 5 USD (3.45)
  expect(g.admit("video.normal")).toEqual({ allow: false, reason: "WOULD_EXCEED_APPROVED_USD", committed: 3.45, projected: 5.05 }); // the next would reach 5.05
});

it("a ceiling below the worst case of the first paid job refuses it before any call", () => {
  const g = createSpendGuard({ approvedUsd: 1 });
  expect(g.admit("video.normal")).toEqual({ allow: false, reason: "WOULD_EXCEED_APPROVED_USD", committed: 0, projected: 1.6 });
  expect(g.admit("image.normal").allow).toBe(true);   // 0.25 fits
  expect(g.snapshot().committed).toBe(0.25);
});

it("only the approved kinds may spend: text, hybrid and unknown jobs are refused", () => {
  const g = createSpendGuard({ approvedUsd: 100 });
  for (const kind of ["text.standard", "hybrid", "video.unknown", undefined, "", "image.premium"]) expect(g.admit(kind).reason).toBe("NOT_PART_OF_THE_APPROVED_RUN");
  expect(g.snapshot().committed).toBe(0);
});

it("the defaults are pessimistic relative to what the code actually requests", () => {
  expect(DEFAULT_WORST_CASE.videoPerSecondUsd).toBe(0.4);  // Veo 3.1 with audio, versus the 0.08 Fast no-audio the code requests
  expect(DEFAULT_WORST_CASE.imageUsd >= 0.25).toBeTruthy();
});
