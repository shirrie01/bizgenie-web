// BG-017C-05B: renders the shared route table (method, route, purpose, status in the trusted staging bridge, auth, cost/write risk, launch gate, owner) from
// qa/contracts/studio-route-inventory.json. The "bridge" column is computed from the vendored bridge route table (qa/contracts/BG_STUDIO_BRIDGE.extract.json), never typed.
import { readFileSync } from "node:fs";
import { bridgeAllows } from "../qa/bridge-gate.mjs";
const U = "11111111-1111-4111-8111-111111111111";
export const inventory = () => JSON.parse(readFileSync(new URL("../qa/contracts/studio-route-inventory.json", import.meta.url), "utf8")).entries;
export const bridgeStatus = (route) => { const [m, ...p] = route.split(" "); const path = p.join(" ").replaceAll(":id", U).replace(/\/(\w+)\/:platform/, "/$1/x"); return bridgeAllows(m, path.replace(":platform", "x")); };
export function rows() {
  return inventory().flatMap((e) => e.routes.map((r) => ({ route: r, carried: bridgeStatus(r), ...e })));
}
export function renderMarkdown() {
  const head = "| # | Method and route | Business purpose | Studio gate | In the bridge | Auth | Cost / write risk | Launch class (#128) | Owner / decision |\n|---|---|---|---|---|---|---|---|---|\n";
  return head + rows().map((r, i) => `| ${i + 1} | \`${r.route}\` | ${r.purpose} | ${r.studio_gate} | ${r.carried ? "carried" : "**NOT carried**"} | Supabase bearer, tenant-scoped${/public/.test(r.route) ? " (public route)" : ""} | ${r.risk} | **${r.launch_class}** | ${r.owner}${r.decision_needed ? `. Decision: ${r.decision_needed}` : ""} |`).join("\n") + "\n";
}
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(renderMarkdown());
