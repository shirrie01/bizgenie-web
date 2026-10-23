// Pure mapping between the Premium Studio onboarding form and the `workspace-onboarding.v1` contract
// (BG-STUDIO-010-FE). No DOM, no network, no storage.
//
// Provenance rules this module encodes:
//  - A sector or channel list is "saved" only when the server's onboarding record holds it.
//  - The server marks each as "customer" (chosen) or "inferred". The browser sends "customer" only for a value
//    the customer actually picked, and "inferred" only for a sector worked out from their own words.
//  - An inferred value is never sent over a saved customer choice (the API would refuse it anyway).
//  - A Brand Brain description that bootstrap seeded from a web address is NOT a description the customer wrote.
import { SECTORS, SECTOR_ORDER, resolveSector } from "./sectors";

export const SEEDED_DESCRIPTION_PREFIX = "Customer-provided website or profile:";
export const isSeededDescription = (text) => String(text || "").trim().startsWith(SEEDED_DESCRIPTION_PREFIX);

export const CHANNEL_LABELS = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Email", "Website"];
export const channelKey = (label) => String(label || "").trim().toLowerCase();
export const channelLabel = (key) => CHANNEL_LABELS.find((l) => channelKey(l) === key) || key;

// Form field -> contract draft key. Limits are the API's draft limits.
export const DRAFT_FIELDS = [
  ["businessName", "business_name", 200, "Business name"],
  ["website", "website_or_social_profile", 500, "Website"],
  ["challenge", "primary_marketing_challenge", 1000, "Your challenge"],
  ["description", "description", 2000, "Description"],
  ["audience", "audience_summary", 2000, "Who it serves"],
  ["cta", "primary_cta", 500, "Customer action"],
  ["goal", "goal", 2000, "Goal"],
];
export const INDUSTRY_TEXT_LIMIT = 200;
export const MAX_STEP = 20;

export const SAVED_LABEL = {
  saved_customer: "Saved · you chose this",
  saved_inferred: "Saved · inferred from what you typed, not confirmed",
};

const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const trimmed = (v) => String(v == null ? "" : v).trim();

// Form values that come from the saved onboarding record. Only fields the form has not already been given.
export function formFromOnboarding(onboarding) {
  const out = { draft: {}, sectorChoice: "", industryText: "", channels: [], step: null };
  if (!onboarding || onboarding.version === 0) return out;
  for (const [field, key] of DRAFT_FIELDS) if (onboarding.draft && typeof onboarding.draft[key] === "string") out.draft[field] = onboarding.draft[key];
  out.industryText = typeof onboarding.industry_text === "string" ? onboarding.industry_text : "";
  // A saved customer choice restores as a choice. A saved inferred sector restores as "work it out", never as a choice.
  out.sectorChoice = onboarding.sector.source === "customer" && onboarding.sector.key ? onboarding.sector.key : "";
  out.channels = (onboarding.channels.values || []).map(channelLabel);
  out.step = Number.isInteger(onboarding.current_step) ? onboarding.current_step : null;
  return out;
}

// The sector the UI shows, with where it came from.
//   local choice > saved customer choice (same thing, hydrated into the choice) > inference from typed words
//   > saved inferred value > none.
export function effectiveSector({ sectorChoice = "", texts = [], onboarding = null } = {}) {
  const resolved = resolveSector({ choice: sectorChoice, texts });
  const saved = onboarding && onboarding.sector && onboarding.sector.key ? onboarding.sector : null;
  if (resolved.source === "chosen") {
    const same = saved && saved.source === "customer" && saved.key === resolved.key;
    return { key: resolved.key, source: same ? "saved_customer" : "customer" };
  }
  if (resolved.source === "inferred") {
    const same = saved && saved.source === "inferred" && saved.key === resolved.key;
    return { key: resolved.key, source: same ? "saved_inferred" : "inferred" };
  }
  if (saved && saved.source === "inferred" && SECTORS[saved.key]) return { key: saved.key, source: "saved_inferred" };
  return { key: "neutral", source: "none" };
}

export function channelState({ channels = [], onboarding = null } = {}) {
  const local = [...new Set(channels.map(channelKey).filter(Boolean))].sort();
  const saved = (onboarding && onboarding.channels && onboarding.channels.values ? [...onboarding.channels.values] : []).sort();
  if (!local.length) return { source: "missing", saved: false };
  const same = local.length === saved.length && local.every((v, i) => v === saved[i]);
  return same ? { source: onboarding.channels.source === "inferred" ? "saved_inferred" : "saved_customer", saved: true } : { source: "customer", saved: false };
}

// The request body for PUT. Only what differs from the saved record is sent; `null` clears. `brain` is the loaded
// Brand Brain: a draft value that equals what the Brand Brain already holds is not duplicated into the draft.
export function buildSavePayload({ onboarding, form, brain = null, step = null, complete }) {
  const saved = onboarding || { version: 0, sector: { key: null, source: null }, channels: { values: [], source: null }, industry_text: null, draft: {}, current_step: null };
  const body = { expected_version: saved.version };
  const errors = [];

  // sector
  const texts = [form.industryText, form.businessName, form.description];
  const choice = clean(form.sectorChoice);
  if (choice && SECTORS[choice]) {
    if (saved.sector.key !== choice || saved.sector.source !== "customer") { body.sector_key = choice; body.sector_source = "customer"; }
  } else if (saved.sector.source === "customer") {
    body.sector_key = null; // back to "work it out": drop the saved choice; an inference can be saved next time
  } else {
    const inferred = resolveSector({ texts });
    if (inferred.source === "inferred" && (saved.sector.key !== inferred.key || saved.sector.source !== "inferred")) { body.sector_key = inferred.key; body.sector_source = "inferred"; }
    else if (inferred.source !== "inferred" && saved.sector.source === "inferred") body.sector_key = null;
  }

  // industry text
  const industry = trimmed(form.industryText);
  if (industry.length > INDUSTRY_TEXT_LIMIT) errors.push(`Kind of business must be ${INDUSTRY_TEXT_LIMIT} characters or fewer to save progress.`);
  else if ((industry || null) !== (saved.industry_text || null)) body.industry_text = industry || null;

  // channels (only ever chosen by clicking, so always "customer")
  const keys = [...new Set((form.channels || []).map(channelKey).filter(Boolean))].filter((k) => CHANNEL_LABELS.some((l) => channelKey(l) === k));
  const savedKeys = saved.channels.values;
  const sameChannels = keys.length === savedKeys.length && [...keys].sort().every((v, i) => v === [...savedKeys].sort()[i]);
  if (!sameChannels) { body.channels = keys; if (keys.length) body.channels_source = "customer"; }
  else if (keys.length && saved.channels.source === "inferred") body.channels_source = "customer";

  // draft: typed answers not yet in the Brand Brain
  const brainValue = { description: brain && brain.identity && brain.identity.description, audience: brain && brain.audience && brain.audience.summary, cta: brain && brain.commercial && brain.commercial.primary_cta, businessName: brain && brain.name };
  const draft = {};
  for (const [field, key, limit, label] of DRAFT_FIELDS) {
    const value = trimmed(form.draft[field]);
    const inBrain = brainValue[field] !== undefined && trimmed(brainValue[field]) === value;
    const wanted = value && !inBrain ? value : null;
    const had = typeof saved.draft[key] === "string" ? saved.draft[key] : null;
    if (wanted && wanted.length > limit) { errors.push(`${label} must be ${limit} characters or fewer to save progress.`); continue; }
    if (wanted !== had) draft[key] = wanted;
  }
  if (Object.keys(draft).length) body.draft = draft;

  if (Number.isInteger(step) && step >= 0 && step <= MAX_STEP && step !== saved.current_step) body.current_step = step;
  if (complete === true) body.complete = true;
  else if (complete === false) body.complete = false;

  const changes = Object.keys(body).filter((k) => k !== "expected_version");
  return { body, errors, hasChanges: changes.length > 0 };
}

// Whether typing differs from what is saved (drives the "unsaved changes" notice).
// A sector merely worked out from the customer's words is not something they did, so it alone is not "unsaved work".
export function hasUnsavedChanges(args) {
  const { body, errors } = buildSavePayload({ ...args, step: undefined });
  const { expected_version: _v, sector_key: sectorKey, sector_source: sectorSource, ...rest } = body;
  const customerSectorChange = sectorKey !== undefined && sectorSource !== "inferred" && !(sectorKey === null && args.onboarding && args.onboarding.sector.source === "inferred");
  return Object.keys(rest).length > 0 || customerSectorChange || errors.length > 0;
}

// The user may confirm setup only from saved, genuinely customer-supplied facts.
export function confirmationReadiness({ onboarding, brain, brandNamePlaceholder }) {
  const missing = [];
  if (!onboarding || onboarding.version === 0 || !onboarding.sector.key) missing.push("Save your sector.");
  if (!onboarding || !onboarding.channels.values.length) missing.push("Save at least one channel.");
  if (!brain || !trimmed(brain.name) || brandNamePlaceholder !== false) missing.push("Save your real business name to your Brand Brain.");
  const description = brain && brain.identity && brain.identity.description;
  if (!trimmed(description) || isSeededDescription(description)) missing.push("Save a description of what the business does (a website address is not a description).");
  return { ready: missing.length === 0, missing };
}

export const SECTOR_KEYS = ["neutral", ...SECTOR_ORDER];
