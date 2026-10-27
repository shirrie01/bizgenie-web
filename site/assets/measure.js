// Privacy-conscious conversion measurement (BG-WEB-001). First-party only, aggregate-oriented, no cookies, no storage, no fingerprinting.
//  * Off unless an events URL is configured AND the visitor has not signalled Do Not Track / Global Privacy Control.
//  * Events carry a fixed type, the page path, the registration intention, a field NAME and an error CODE. Never a value, never an email, never free text.
//  * A random id per page load (memory only) lets the server tell one visit's events apart; it is not stored in the browser and is not linked to a person.
//  * Delivery is best-effort (`sendBeacon`/`fetch keepalive`); a failure is silent and never affects the page or the form.
export const EVENT_TYPES = ["page_view", "form_view", "form_start", "field_error", "submit_attempt", "submit_success", "submit_failure", "form_abandon"];
export const CONTRACT_VERSION = "site-events.v1";

export function measurementAllowed(nav = globalThis.navigator || {}) {
  const dnt = nav.doNotTrack === "1" || nav.doNotTrack === "yes";
  return !(dnt || nav.globalPrivacyControl === true);
}

export function createMeasurement({ url, attribution = {}, nav, send, pagePath = "/" }) {
  const enabled = Boolean(url) && measurementAllowed(nav);
  const visit = enabled ? globalThis.crypto.randomUUID() : null;
  let started = false;
  let finished = false;
  let lastField = null;
  let intention = null;
  const deliver = send || ((body) => {
    try { if (nav && nav.sendBeacon && nav.sendBeacon(url, new Blob([body], { type: "application/json" }))) return; } catch { /* fall through */ }
    try { fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" }).catch(() => {}); } catch { /* none */ }
  });
  const emit = (type, extra = {}) => {
    if (!enabled || !EVENT_TYPES.includes(type)) return false;
    const e = { type, page: String(pagePath).slice(0, 100) };
    if (extra.intention && ["early_access", "founding_customer"].includes(extra.intention)) e.intention = extra.intention;
    if (extra.field && /^[a-zA-Z]{1,30}$/.test(extra.field)) e.field = extra.field;
    if (extra.code && /^[a-z_]{1,30}$/.test(extra.code)) e.code = extra.code;
    if (extra.kind && /^[a-z_]{1,30}$/.test(extra.kind)) e.kind = extra.kind;
    deliver(JSON.stringify({ contract_version: CONTRACT_VERSION, visit, source: attribution, events: [e] }));
    return true;
  };
  return {
    enabled,
    pageView: () => emit("page_view"),
    formView: () => emit("form_view"),
    touch(field, chosenIntention) {
      if (chosenIntention) intention = chosenIntention;
      lastField = field;
      if (!started) { started = true; emit("form_start", { intention }); }
    },
    setIntention(i) { intention = i; },
    fieldError: (field, code) => emit("field_error", { field, code, intention }),
    attempt: () => emit("submit_attempt", { intention }),
    success() { finished = true; return emit("submit_success", { intention }); },
    failure: (kind) => emit("submit_failure", { kind, intention }),
    abandon() {
      if (started && !finished) { finished = true; return emit("form_abandon", { field: lastField, intention }); }
      return false;
    },
  };
}
