// Product and website context intake (BG-STUDIO-022-FE). The browser NEVER fetches a customer's web address and this module has no network code:
// reading a site is a server-side, SSRF-protected ingestion job that does not exist yet (request CI-02). What exists now is the part that is safe
// without it: the customer states their own facts, each fact carries who said it, and only the customer's approval promotes a fact.
//
// Four kinds of statement, never blended (work order section 6):
//   customer_provided : typed by the customer. Usable once the customer confirms it.
//   website_claim     : taken from a page by a future server job. Shown as "your website says"; NOT trusted until the customer approves it.
//   ai_interpretation : a summary by AI. Always a suggestion; needs approval and keeps its label.
//   approved_fact     : a fact the customer (owner) approved. The ONLY kind that may enter the Brand Brain, and never silently over existing identity.
export const FACT_KINDS = {
  customer_provided: { label: "Provided by you", help: "You typed this. BizGenie has not checked it." },
  website_claim: { label: "Your website says", help: "Read from your page. It may be out of date. Not used until you approve it." },
  ai_interpretation: { label: "AI suggestion", help: "A summary written by AI. Not a fact until you approve it." },
  approved_fact: { label: "Approved by you", help: "You approved this. BizGenie may use it." },
};
export const FIELDS = [
  ["offer", "What you sell and what you are offering", true],
  ["product", "Product or service description", true],
  ["target", "Target customer", true],
  ["differentiators", "What makes you different", false],
  ["landing", "Landing-page wording you want kept", false],
  ["assets", "Existing creative assets you own (names only; upload comes later)", false],
];
const MAX = 1500;

// A web address is accepted as TEXT to remember, never fetched here. Only plain https to a public-looking hostname is accepted; the real SSRF
// defence (DNS/IP checks, redirects, size and type limits) belongs to the server job. This is a courtesy check, not a security boundary.
export function checkWebsite(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: true, value: "" };
  let u; try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return { ok: false, message: "That does not look like a web address." }; }
  if (u.protocol !== "https:") return { ok: false, message: "Use an https address." };
  if (u.username || u.password) return { ok: false, message: "Remove any username or password from the address." };
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^(localhost|.*\.local|.*\.internal)$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return { ok: false, message: "Use your public website name, not an internal or numeric address." };
  return { ok: true, value: `${u.protocol}//${u.host}${u.pathname === "/" ? "" : u.pathname}` };
}

// A fresh context from what the customer typed. Every fact is `customer_provided` and `approved:false` until they press Approve.
export function newContext() { return { website: "", facts: {}, updatedAt: null }; }
export function setFact(context, key, text) {
  if (!FIELDS.some(([k]) => k === key)) return context;
  const value = String(text || "").trim().slice(0, MAX);
  const facts = { ...context.facts };
  if (!value) delete facts[key]; else facts[key] = { text: value, kind: "customer_provided", approved: false };
  return { ...context, facts, updatedAt: new Date().toISOString() };
}
export function setWebsite(context, input) {
  const r = checkWebsite(input); if (!r.ok) return { context, error: r.message };
  return { context: { ...context, website: r.value, updatedAt: new Date().toISOString() }, error: "" };
}
// Only the OWNER can approve. A suggestion (website claim / AI) is approved as a new `approved_fact`, keeping where it came from.
export function approveFact(context, key, { isOwner }) {
  if (!isOwner) return { context, error: "Only the owner of the workspace can approve facts." };
  const f = context.facts[key]; if (!f) return { context, error: "There is nothing to approve." };
  return { context: { ...context, facts: { ...context.facts, [key]: { ...f, approved: true, kind: "approved_fact", origin: f.origin || f.kind } }, updatedAt: new Date().toISOString() }, error: "" };
}
export function summary(context) {
  const facts = Object.entries(context.facts);
  return { total: facts.length, approved: facts.filter(([, f]) => f.approved).length, missingRequired: FIELDS.filter(([k, , req]) => req && !context.facts[k]).map(([, label]) => label) };
}
// Would applying this to the Brand Brain change approved identity? The answer is always "only with the owner's explicit step": it returns the diff, never writes.
export function proposeBrainUpdate(context, brain) {
  const out = [];
  const map = { target: "audience", offer: "cta" };
  for (const [k, field] of Object.entries(map)) {
    const f = context.facts[k]; if (!f || !f.approved) continue;
    const current = String((brain && brain[field]) || "").trim();
    if (current && current !== f.text) out.push({ field, current, proposed: f.text, kind: "replaces_existing" });
    else if (!current) out.push({ field, current: "", proposed: f.text, kind: "fills_empty" });
  }
  return out;
}
// The extraction action is deliberately OFF. The contract it would call is documented in the handoff (CI-02).
export const EXTRACTION_AVAILABLE = false;
export const EXTRACTION_BLOCKER = "Reading your website needs a server-side service that is not available yet. Until then, add the details yourself below.";
