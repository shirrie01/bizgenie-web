// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createProxy } from "../../scripts/staging/operator-proxy.mjs";

const base = { upstream: "https://tag---svc-abc-uc.a.run.app", idToken: "ID.TOKEN.X", studioOrigin: "http://127.0.0.1:4173" };
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));

describe("operator proxy for a private Cloud Run revision (BG-LAUNCH-013)", () => {
  it("refuses unsafe configuration", () => {
    expect(() => createProxy({ ...base, upstream: "http://evil.example" })).toThrow(/run\.app/);
    expect(() => createProxy({ ...base, idToken: "" })).toThrow(/ID_TOKEN/);
    expect(() => createProxy({ ...base, studioOrigin: "https://app.example" })).toThrow(/local/);
  });
  it("keeps the Supabase Authorization, adds the identity token in X-Serverless-Authorization, and serves only the Studio origin", async () => {
    let seen; const fetchImpl = async (u, init) => { seen = { u, init }; return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }); };
    const s = createProxy({ ...base, fetchImpl }); const port = await listen(s);
    try {
      const pre = await fetch(`http://127.0.0.1:${port}/customer/x`, { method: "OPTIONS", headers: { origin: base.studioOrigin } });
      expect(pre.status).toBe(204); expect(pre.headers.get("access-control-allow-origin")).toBe(base.studioOrigin); expect(seen).toBeUndefined();
      const r = await fetch(`http://127.0.0.1:${port}/customer/workspaces?a=1`, { headers: { origin: base.studioOrigin, authorization: "Bearer SUPABASE.JWT" } });
      expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true });
      expect(seen.u).toBe(`${base.upstream}/customer/workspaces?a=1`);
      expect(seen.init.headers.authorization).toBe("Bearer SUPABASE.JWT"); expect(seen.init.headers["x-serverless-authorization"]).toBe("Bearer ID.TOKEN.X");
      expect((await fetch(`http://127.0.0.1:${port}/`, { headers: { origin: "http://evil.example" } })).status).toBe(403);
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(403);
    } finally { s.close(); }
  });
});
