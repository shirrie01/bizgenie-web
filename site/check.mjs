// `npm run site:check` — lists what is still missing before the website can be published (BG-WEB-LEGAL-CLOSURE-13/14). Exit 0 = ready for `site:build:strict`,
// exit 2 = items outstanding. Reads site/config.mjs only; prints no secrets; changes nothing. `--json` prints a machine-readable report.
import { unresolvedItems } from "./config.mjs";

const OWNERS = { company: "Company facts (founder)", contact: "Contact and support (founder)", privacy: "Privacy decisions (founder, adviser to confirm)", terms: "Terms (adviser)",
  approval: "Legal approval (adviser)", build: "Build configuration (set SITE_API_URL when checking and building)" };
const items = unresolvedItems();
const open = items.map((i) => i.message);
const report = Object.entries(OWNERS).map(([owner, group]) => ({ group, items: items.filter((i) => i.owner === owner).map((i) => i.message) }));

if (process.argv.includes("--json")) console.log(JSON.stringify({ ready: open.length === 0, outstanding: open.length, report: report.filter((g) => g.items.length) }, null, 2));
else if (open.length === 0) console.log("site:check — nothing outstanding. Run: npm run site:build:strict");
else {
  console.log(`site:check — ${open.length} item(s) outstanding; the strict build will refuse to publish:`);
  for (const g of report) if (g.items.length) { console.log(`\n${g.group}`); for (const i of g.items) console.log(`  - ${i}`); }
}
process.exit(open.length ? 2 : 0);
