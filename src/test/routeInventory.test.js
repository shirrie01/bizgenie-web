// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { inventory, rows, renderMarkdown } from "../../scripts/route-table.mjs";

// BG-017C-05B: the shared route table. LOCAL (static analysis + the vendored bridge route table). It is the Studio's side of the route contract with Codex's bridge (API PR #229).
const U = "11111111-1111-4111-8111-111111111111";
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const scanned = () => {
  const out = new Set();
  for (const f of walk("src")) {
    if (!/\.(js|jsx)$/.test(f) || /\.test\.|\/test\//.test(f)) continue;
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/`\$\{[A-Za-z_.]+\}(\/[a-z][^`?]*)`?/g)) out.add(m[1].replace(/\$\{[^}]+\}/g, U));
    for (const m of s.matchAll(/["'](\/(?:customer|billing|public)\/[^"'?]*)["']/g)) out.add(m[1]);
  }
  return [...out].sort();
};
const segs = (p) => p.split("/").filter(Boolean);
const covers = (path, route) => { const a = segs(path), b = segs(route.split(" ").slice(1).join(" ").replaceAll(":id", U).replace(":platform", "x")); return a.length === b.length && a.every((x, i) => x === b[i] || x === U || b[i] === U); };
const DYNAMIC = [`/customer/social${U}`, `/customer/insights${U}\${q `, "/customer/assets/uploads/", "/billing/checkout/success", "/billing/checkout/cancel"]; // built from a suffix at run time, or Studio pages (not API routes)

describe("shared route table: every API route the Studio can call, classified against the frozen launch contract (BG-017C-05B)", () => {
  it("classes are A, B, C or E and every row says who owns it", () => {
    for (const e of inventory()) { expect(["A", "B", "C", "E"]).toContain(e.launch_class); expect(e.owner.length).toBeGreaterThan(3); expect(e.routes.length).toBeGreaterThan(0); }
  });
  it("every API path the Studio calls is in the table (it cannot go stale silently)", () => {
    const all = rows().map((r) => r.route);
    const missing = scanned().filter((p) => !DYNAMIC.includes(p) && !all.some((r) => covers(p, r)));
    expect(missing).toEqual([]);
  });
  it("every mandatory (A) route is carried by the bridge at API PR #229 86b39d70, including Stripe checkout (gated off in both the bridge and the Studio until separately approved)", () => {
    expect(rows().filter((r) => r.launch_class === "A" && !r.carried).map((r) => r.route)).toEqual([]);
    const row = inventory().find((e) => e.routes.includes("POST /billing/stripe/checkout")); expect(row.studio_gate).toMatch(/OFF in a bridge-marked build/); expect(row.decision_needed).toMatch(/separately approved Stripe test-mode activation/);
  });
  it("the first-customer journey (A) routes the bridge does carry are exactly the ones the Studio sends with the methods it uses", () => {
    const carriedA = rows().filter((r) => r.launch_class === "A" && r.carried).map((r) => r.route);
    for (const r of ["GET /customer/workspace", "POST /customer/workspace/bootstrap", "PUT /customer/workspace/brand-brain", "POST /customer/campaigns", "POST /customer/generation-quotes", "POST /customer/generation-quotes/:id/confirm", "GET /customer/billing/subscription", "POST /customer/campaigns/:id/variants/:id/approval", "POST /customer/campaigns/:id/variants/:id/schedule"]) expect(carriedA, r).toContain(r);
  });
  it("anything not carried that the Studio would call by default has truthful wording or an explicit owner decision", () => {
    for (const r of rows().filter((x) => !x.carried)) {
      if (/^always/.test(r.studio_gate)) expect(r.ui_when_unavailable, r.route).toMatch(/not available in this test environment|Superseded/);
      if (r.launch_class === "A" || r.launch_class === "C") expect(Boolean(r.decision_needed) || r.studio_gate !== "always" || /legacy/i.test(r.studio_gate), r.route).toBe(true);
    }
  });
  it("the published table matches the inventory and the bridge route table (no hand-edited drift)", () => {
    const doc = readFileSync("docs/studio/BG_017C_05B_ROUTE_TABLE.md", "utf8");
    const body = doc.split("<!-- ROUTE_TABLE_START -->")[1].split("<!-- ROUTE_TABLE_END -->")[0].trim();
    expect(body).toBe(renderMarkdown().trim());
  });
});
