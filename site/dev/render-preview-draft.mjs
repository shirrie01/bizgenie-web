// Render an internal draft for review. The public site build does not call this script.
import { readFileSync, writeFileSync } from "node:fs";
import { layout } from "../templates.mjs";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error("Usage: node site/dev/render-preview-draft.mjs draft.json output.html");
const draft = JSON.parse(readFileSync(source, "utf8"));
if (draft.contract !== "early-access-preview-draft.v1" || draft.provenance !== "deterministic_fixture" ||
    draft.status !== "internal_review" || draft.slides?.length !== 7) {
  throw new Error("Expected a seven-slide fixture draft for internal review");
}
const escape = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slides = draft.slides.map(({ title, body }) =>
  `<li><article><h2>${escape(title)}</h2><p>${escape(body)}</p></article></li>`).join("");
writeFileSync(destination, layout({
  title: "Early-access preview draft — BizGenie", description: "Internal fixture preview for review",
  path: "/internal-preview/", scripts: false,
  body: `<main id="main" class="section"><div class="wrap"><h1>Early-access preview draft</h1>
    <p>Internal review only. Deterministic fixture for ${escape(draft.businessName)}. No AI-generated output, invitation or email was produced.</p>
    <ol>${slides}</ol></div></main>`,
}));
