// Static build for the public website: `node site/build.mjs [--strict]` -> site-dist/. No framework, no bundler, no runtime dependencies.
// The Premium application (src/, Vite) is untouched and shares nothing with this build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { company, runtime, unresolved } from "./config.mjs";
import { previews } from "./content.mjs";
import { deletionPage, homePage, notFoundPage, privacyPage, termsPage } from "./templates.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", process.env.SITE_OUT || "site-dist");
const strict = process.argv.includes("--strict") || process.env.SITE_STRICT === "1";

const open = unresolved();
if (strict && open.length) {
  console.error("site build refused (--strict): unresolved items\n - " + open.join("\n - "));
  process.exit(2);
}
const missing = previews.filter((p) => !fs.existsSync(path.join(here, p.file)));
if (missing.length) {
  console.error("site build refused: preview images missing\n - " + missing.map((p) => p.file).join("\n - "));
  process.exit(3);
}

fs.rmSync(out, { recursive: true, force: true });
const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const copy = (from, rel) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.copyFileSync(from, f);
};

const ctx = { strict };
write("index.html", homePage(ctx));
write("privacy/index.html", privacyPage(ctx));
write("terms/index.html", termsPage(ctx));
write("data-deletion/index.html", deletionPage(ctx));
write("404.html", notFoundPage(ctx));
for (const f of fs.readdirSync(path.join(here, "assets"))) copy(path.join(here, "assets", f), `assets/${f}`);
for (const p of previews) copy(path.join(here, p.file), p.file);
write("robots.txt", `User-agent: *\n${strict ? "Allow: /" : "Disallow: /"}\n${strict ? `Sitemap: ${company.siteUrl}/sitemap.xml\n` : ""}`);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", "/privacy/", "/terms/", "/data-deletion/"].map((p) => `<url><loc>${company.siteUrl}${p}</loc></url>`).join("\n")}\n</urlset>\n`,
);
// Reference security headers for whichever static host is chosen (see docs/website/BG_WEB_001_HOSTING_AND_CUTOVER.md). No inline script or style is used.
const connect = ["'self'", runtime.apiBaseUrl].filter(Boolean).join(" ");
write(
  "headers.reference.json",
  JSON.stringify(
    {
      "Content-Security-Policy": `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src ${connect}; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`,
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control (html)": "no-cache",
      "Cache-Control (assets, previews)": "public, max-age=3600 (use immutable only with hashed file names)",
    },
    null,
    2,
  ) + "\n",
);

console.log(`site built -> ${path.relative(process.cwd(), out)} (${strict ? "strict" : "draft"} build)`);
if (!strict && open.length) console.log("unresolved before publication:\n - " + open.join("\n - "));
