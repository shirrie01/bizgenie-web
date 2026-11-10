// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveApiConfig } from "../apiConfig.js";

const HOSTED = { protocol: "https:", hostname: "bizgenie-studio-staging.pages.dev" };
const LOCALPAGE = { protocol: "http:", hostname: "127.0.0.1" };
describe("API origin configuration (BG-017C-05B)", () => {
  it("a hosted page needs an explicit https origin", () => {
    expect(resolveApiConfig("https://staging-api.getbizgenie.com", HOSTED)).toEqual({ ok: true, origin: "https://staging-api.getbizgenie.com" });
    expect(resolveApiConfig("https://bridge.example.test/", HOSTED)).toEqual({ ok: true, origin: "https://bridge.example.test" });
  });
  it.each([[undefined], [""], ["   "], [null]])("a hosted page with the API origin %s does not start, and never falls back to localhost", (v) => expect(resolveApiConfig(v, HOSTED)).toEqual({ ok: false, reason: "missing" }));
  it.each([["http://localhost:8080", "local_on_hosted_page", "https"], ["https://localhost:8080", "local_on_hosted_page"], ["https://127.0.0.1", "local_on_hosted_page"], ["http://staging-api.getbizgenie.com", "insecure"]])("a hosted page refuses %s (%s)", (v, reason) => expect(resolveApiConfig(v, HOSTED)).toMatchObject({ ok: false, reason: expect.stringMatching(/insecure|local_on_hosted_page|invalid/) }));
  it.each([["not a url"], ["ftp://x.test"], ["https://user:pw@x.test"], ["https://x.test/api"], ["https://x.test/?a=1"], ["https://x.test/#h"]])("%s is invalid", (v) => expect(resolveApiConfig(v, HOSTED)).toEqual({ ok: false, reason: "invalid" }));
  it("a local development or test page keeps the development default and may use http", () => {
    expect(resolveApiConfig(undefined, LOCALPAGE)).toEqual({ ok: true, origin: "http://localhost:8080" });
    expect(resolveApiConfig("http://api.test", LOCALPAGE)).toEqual({ ok: true, origin: "http://api.test" });
    expect(resolveApiConfig("http://localhost:8080", { protocol: "https:", hostname: "localhost" })).toMatchObject({ ok: true });
  });
});
