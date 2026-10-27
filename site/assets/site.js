import { buildPayload, messageFor, newSubmissionId, readAttribution, submitLead, validate } from "./form-model.js";
import { createMeasurement } from "./measure.js";

// DOM wiring for the registration form. No cookies, no storage. All text a visitor sees is built here or in the HTML; values typed into the form are
// only ever sent to the configured registration endpoint, never to measurement.
const meta = (n) => (document.querySelector(`meta[name="${n}"]`) || {}).content || "";
const apiBase = meta("bg-api-url").replace(/\/+$/, "");
const leadUrl = apiBase ? apiBase + meta("bg-lead-path") : "";
const eventsUrl = meta("bg-events-url");
const attribution = readAttribution(location.search, document.referrer, location.pathname);
const measure = createMeasurement({ url: eventsUrl, attribution, nav: navigator, pagePath: location.pathname });
measure.pageView();

const form = document.getElementById("register-form");
if (form) {
  const $ = (id) => document.getElementById(id);
  const summary = $("form-error-summary");
  const status = $("status");
  const button = $("submit-btn");
  const closed = $("closed-note");
  const success = $("success");
  const shownAt = performance.now();
  const FIELDS = { intention: "intent-early_access", name: "f-name", email: "f-email", company: "f-company", industry: "f-industry", contactConsent: "c-contact" };
  let attempt = null; // { id, fingerprint } kept in memory so a retry reuses the SAME submission id

  if (!leadUrl) { closed.hidden = false; button.disabled = true; }

  // Which registration the visitor meant: the CTA they pressed preselects it.
  const setIntent = (v) => { const r = form.querySelector(`input[name="intention"][value="${v}"]`); if (r) { r.checked = true; measure.setIntention(v); } };
  document.querySelectorAll("[data-intent]").forEach((a) => a.addEventListener("click", () => setIntent(a.getAttribute("data-intent"))));
  const intent = () => (form.querySelector('input[name="intention"]:checked') || {}).value || "";

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { measure.formView(); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(form);
  }
  form.addEventListener("input", (e) => { if (e.target && e.target.name) measure.touch(e.target.name, intent()); });
  form.addEventListener("change", (e) => { if (e.target && e.target.name) { measure.touch(e.target.name, intent()); if (e.target.name === "intention") measure.setIntention(e.target.value); } });
  const leave = () => measure.abandon();
  addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });

  const collect = () => {
    const f = new FormData(form);
    return {
      name: f.get("name"), email: f.get("email"), company: f.get("company"), industry: f.get("industry"), intention: f.get("intention"),
      priorities: f.getAll("priorities"), notes: f.get("notes"), contactConsent: f.get("contactConsent") === "on", marketingConsent: f.get("marketingConsent") === "on",
    };
  };

  function showErrors(errors) {
    const list = summary.querySelector("ul"); list.textContent = "";
    for (const id of Object.values(FIELDS)) { const el = $(id); if (el) el.removeAttribute("aria-invalid"); }
    document.querySelectorAll(".error[id$='-error']").forEach((p) => { p.hidden = true; p.textContent = ""; });
    for (const [field, code] of Object.entries(errors)) {
      const text = messageFor(field, code);
      const li = document.createElement("li"); const a = document.createElement("a");
      a.href = `#${FIELDS[field]}`; a.textContent = text; li.appendChild(a); list.appendChild(li);
      const p = $(`${field}-error`); if (p) { p.textContent = text; p.hidden = false; }
      const el = $(FIELDS[field]); if (el) el.setAttribute("aria-invalid", "true");
      measure.fieldError(field, code);
    }
    summary.hidden = false; summary.focus();
    list.querySelectorAll("a").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); const t = $(a.getAttribute("href").slice(1)); if (t) t.focus(); }));
  }
  const clearErrors = () => { summary.hidden = true; document.querySelectorAll(".error[id$='-error']").forEach((p) => { p.hidden = true; }); };

  const WORDS = {
    rate_limited: "There have been too many attempts from your connection. Please wait a few minutes and try again. Your answers are still here.",
    network: "We could not reach the registration service. Your answers are still here, so you can try again.",
    unavailable: "The registration service is not available right now. Your answers are still here, so you can try again shortly.",
    invalid: "The registration service could not accept those details. Please check them and try again.",
    conflict: "A registration with this reference was already received with different details. Please reload the page and register again.",
    closed: "Registration is not open on this preview of the site.",
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    clearErrors(); status.textContent = "";
    const check = validate(collect());
    if (!check.ok) { showErrors(check.errors); return; }
    // Honeypot: a person never sees this field. Pretend it worked, send nothing.
    if (($("f-hp") || {}).value) { renderSuccess(check.values.intention, null); return; }
    const fingerprint = JSON.stringify(check.values);
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = { id: newSubmissionId(), fingerprint };
    button.disabled = true; status.textContent = "Sending…"; measure.attempt();
    const payload = await buildPayload({ values: check.values, attribution, submissionId: attempt.id, elapsedMs: Math.max(0, performance.now() - shownAt), consentContactText: $("c-contact-label").textContent.trim(), consentMarketingText: $("c-marketing-label").textContent.trim() });
    const result = await submitLead({ url: leadUrl, payload });
    if (result.kind === "received") { measure.success(); attempt = null; renderSuccess(check.values.intention, result.reference); return; }
    measure.failure(result.kind);
    button.disabled = false; status.textContent = WORDS[result.kind] || WORDS.unavailable;
    if (result.kind === "invalid") attempt = null; // changed details need a new submission id
  });

  function renderSuccess(intention, reference) {
    form.querySelectorAll(".field, .consent, .actions, .hp").forEach((el) => { el.hidden = true; });
    $("success-text").textContent = intention === "founding_customer"
      ? "You registered as a founding customer. Founding-customer registrations are looked at first when invitations are decided."
      : "You registered for early access. We will email you when there is news about access.";
    if (reference) { const p = document.createElement("p"); p.className = "fine"; p.textContent = `Reference: ${reference}`; $("success-text").after(p); }
    success.hidden = false; success.focus();
  }
}
