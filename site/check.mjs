// `npm run site:check` — lists what is still missing before the website can be published (BG-WEB-LEGAL-CLOSURE-13/14). Exit 0 = ready for `site:build:strict`,
// exit 2 = items outstanding. Reads site/config.mjs only; prints no secrets; changes nothing. `--json` prints a machine-readable report.
import { unresolved } from "./config.mjs";

const GROUPS = [
  ["Company facts (founder)", /^(companyNumber|registeredOffice)\b/],
  ["Contact and support (founder)", /^(contactEmail|privacyContactEmail)\b/],
  ["Privacy decisions (founder, adviser to confirm)", /^(retentionDecision|processors|internationalTransfers)\b/],
  ["Terms (adviser)", /^governingLaw\b/],
  ["Legal approval (adviser)", /^legalReviewed\b/],
  ["Build configuration", /^SITE_API_URL\b/],
];
const open = unresolved();
const report = GROUPS.map(([group, re]) => ({ group, items: open.filter((i) => re.test(i)) }));
const placed = new Set(report.flatMap((g) => g.items));
const other = open.filter((i) => !placed.has(i));
if (other.length) report.push({ group: "Other", items: other });

if (process.argv.includes("--json")) console.log(JSON.stringify({ ready: open.length === 0, outstanding: open.length, report: report.filter((g) => g.items.length) }, null, 2));
else if (open.length === 0) console.log("site:check — nothing outstanding. Run: npm run site:build:strict");
else {
  console.log(`site:check — ${open.length} item(s) outstanding; the strict build will refuse to publish:`);
  for (const g of report) if (g.items.length) { console.log(`\n${g.group}`); for (const i of g.items) console.log(`  - ${i}`); }
}
process.exit(open.length ? 2 : 0);
