// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createProxy } from "../../scripts/staging/operator-proxy.mjs";

const base = { upstream: "https://tag---bizgenie-api-staging-abc123-uc.a.run.app", idToken: "ID.TOKEN.X", studioOrigin: "http://127.0.0.1:4173" };
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));

describe("operator proxy for a private Cloud Run revision (BG-LAUNCH-013)", () => {
  it("refuses unsafe configuration", () => {
    for (const bad of ["http://evil.example", "https://bizgenie-api-abc123-uc.a.run.app", "https://bizgenie-api-production-abc123-uc.a.run.app", "https://tag---bizgenie-api-staging-abc123-uc.a.run.app.evil.example", "https://evil.a.run.app"]) expect(() => createProxy({ ...base, upstream: bad })).toThrow(/bizgenie-api-staging/);
    expect(() => createProxy({ ...base, upstream: "https://prod---bizgenie-api-staging-abc123-uc.a.run.app" })).toThrow(/bizgenie-api-staging/);
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
  it("only forwards /customer/ requests that carry a Supabase Authorization, never DELETE, never leaks the token, and logs nothing", async () => {
    const logged = []; const spies = ["log", "error", "warn", "info"].map((m) => vi.spyOn(console, m).mockImplementation((...a) => logged.push(a.join(" "))));
    let calls = 0; const fetchImpl = async () => { calls += 1; return new Response("ok", { status: 200, headers: { "content-type": "text/plain", "x-secret": "ID.TOKEN.X" } }); };
    const s = createProxy({ ...base, fetchImpl }); const port = await listen(s); const o = { origin: base.studioOrigin };
    try {
      const u = (p) => `http://127.0.0.1:${port}${p}`;
      expect((await fetch(u("/customer/x"), { headers: o })).status).toBe(401);
      expect((await fetch(u("/admin"), { headers: { ...o, authorization: "Bearer a" } })).status).toBe(404);
      expect((await fetch(u("/customer/assets/1"), { method: "DELETE", headers: { ...o, authorization: "Bearer a" } })).status).toBe(405);
      expect(calls).toBe(0);
      const r = await fetch(u("/customer/x"), { headers: { ...o, authorization: "Bearer a" } });
      expect(r.status).toBe(200); expect([...r.headers.entries()].join()).not.toMatch(/ID\.TOKEN/); expect(await r.text()).not.toMatch(/ID\.TOKEN/);
      expect(r.headers.get("access-control-allow-methods")).not.toMatch(/DELETE/);
      const down = createProxy({ ...base, fetchImpl: async () => { throw new Error("boom ID.TOKEN.X"); } }); const p2 = await listen(down);
      const e = await fetch(`http://127.0.0.1:${p2}/customer/x`, { headers: { ...o, authorization: "Bearer a" } }); expect(e.status).toBe(502); expect(await e.text()).not.toMatch(/ID\.TOKEN|boom/); down.close();
      expect(s.address().address).toBe("127.0.0.1");
    } finally { s.close(); spies.forEach((x) => x.mockRestore()); }
    expect(logged.join(" ")).not.toMatch(/ID\.TOKEN/);
  });
});
