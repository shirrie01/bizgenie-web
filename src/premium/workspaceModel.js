// Production workspace view model (BG-STUDIO-008-FE). Pure: no DOM, no network, no storage.
//
// Rules this module enforces, and its tests pin:
//  - Only real inputs are used: the workspace record, the Brand Brain, answers the customer typed in this
//    session, and the real campaign. Nothing is invented: no metrics, results, posts, creative or schedule.
//  - Every fact carries its provenance: "backend" (Brand Brain), "customer" (typed, not saved), "inferred"
//    (worked out from the customer's own text, changeable) or "missing".
//  - A generic placeholder brand name is treated as missing. A demonstration brand can never appear because
//    no demonstration content exists in this module.
import { SECTORS, guidanceFor } from "./sectors";
import { SAVED_LABEL, channelState, effectiveSector, isSeededDescription } from "./onboardingModel";

// BG-STUDIO-010-FE: whether the Brand Brain name is a generated placeholder is decided by the backend
// (`brand_name_placeholder` on GET /customer/workspace/onboarding), not by a list of strings in the browser.
// While that answer is unknown (not loaded, or unavailable) the name is shown but the profile is never "complete".

const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

export const SOURCE_LABEL = {
  backend: "Saved in your Brand Brain",
  customer: "You entered this · not saved yet",
  inferred: "Inferred from what you typed · you can change it",
  missing: "Not provided yet",
  seeded: "Only a web address was given at setup",
  ...SAVED_LABEL,
};

const fact = (key, label, value, source, note = "") => ({ key, label, value: source === "missing" ? "" : value, source, sourceLabel: SOURCE_LABEL[source], note });

export function brainFacts(brain, draft = {}, { placeholder = null } = {}) {
  const pick = (saved, typed) => {
    const s = clean(saved);
    if (s) return { value: s, source: "backend" };
    const t = clean(typed);
    return t ? { value: t, source: "customer" } : { value: "", source: "missing" };
  };
  const name = pick(placeholder === true ? "" : brain?.name, draft.businessName);
  // A description that bootstrap seeded from a web address is not something the customer wrote about the business.
  const seeded = isSeededDescription(brain?.identity?.description);
  const description = pick(seeded ? "" : brain?.identity?.description, draft.description);
  description.seeded = seeded;
  const audience = pick(brain?.audience?.summary, draft.audience);
  const cta = pick(brain?.commercial?.primary_cta, draft.cta);
  const tone = pick(brain?.voice?.tone, "");
  return { name, description, audience, cta, tone };
}

function campaignSummary(campaign) {
  if (!campaign || !campaign.campaign_id) return null;
  const counts = { draft: 0, review: 0, approved: 0, published: 0, other: 0 };
  const destinations = new Set();
  for (const item of campaign.items || []) {
    for (const variant of item.variants || []) {
      if (variant.workflow in counts) counts[variant.workflow] += 1; else counts.other += 1;
      if (variant.destination_label) destinations.add(variant.destination_label);
    }
  }
  const total = counts.draft + counts.review + counts.approved + counts.published + counts.other;
  return { id: campaign.campaign_id, name: clean(campaign.name), total, counts, destinations: [...destinations] };
}

// Real campaign summaries from the backend list endpoint, reduced to the fields the workspace shows. Archived
// campaigns are left out. Newest first. Unknown shapes are ignored rather than guessed at.
export function summariseCampaigns(list) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.campaign_id === "string" && !c.archived_at)
    .map((c) => ({ id: c.campaign_id, name: clean(c.name) || "Untitled campaign", status: clean(c.status), updatedAt: typeof c.updated_at === "string" ? c.updated_at : "" }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildWorkspaceModel({ workspace = null, brain = null, draft = {}, goal = "", channels = [], sectorChoice = "", campaign = null, campaigns = [], hasRecommendation = false, onboarding = null, onboardingStatus = "idle", brandNamePlaceholder = null } = {}) {
  const facts = brainFacts(brain, draft, { placeholder: brandNamePlaceholder });
  const workspaceName = brandNamePlaceholder === true ? "" : clean(workspace?.brand_name);
  const name = facts.name.value || workspaceName;
  const nameSource = facts.name.value ? facts.name.source : workspaceName ? "backend" : "missing";
  const hasName = Boolean(name);

  const sector = effectiveSector({ sectorChoice, texts: [draft.industryText, name, facts.description.value], onboarding });
  const sectorEntry = SECTORS[sector.key];
  const sectorSource = sector.source === "none" ? "missing" : sector.source;

  const goalText = clean(goal);
  const channelList = [...new Set((channels || []).map(clean).filter(Boolean))];
  const camp = campaignSummary(campaign);
  // Complete means the customer explicitly confirmed setup (saved onboarding status "completed", which the server only
  // allows with a saved sector and channel) AND the Brand Brain holds a real, backend-confirmed name and a description
  // the customer wrote. A bootstrap-seeded web address or challenge never makes a profile complete, and neither does
  // typed-but-unsaved text.
  const onboardingCompleted = Boolean(onboarding && onboarding.status === "completed");
  const profileComplete = onboardingCompleted && brandNamePlaceholder === false && nameSource === "backend" && facts.description.source === "backend";
  const profileUnknown = onboardingStatus === "error" || onboardingStatus === "unavailable" || onboardingStatus === "loading" || onboardingStatus === "idle";
  const channelInfo = channelState({ channels: channelList, onboarding });

  const rows = [
    fact("name", "Business name", name, nameSource),
    fact("description", "What the business does", facts.description.value, facts.description.source, facts.description.seeded ? "Your Brand Brain only holds the web address given at setup. That is not a description of what the business does." : ""),
    fact("audience", "Who it serves", facts.audience.value, facts.audience.source),
    fact("cta", "What a customer should do next", facts.cta.value, facts.cta.source),
    fact("tone", "Brand tone", facts.tone.value, facts.tone.source),
    fact("sector", "Sector", sectorEntry.label, sectorSource, sector.source === "none" ? "Neutral layout: general guidance that suits any business. Choose a sector if one of them fits." : ""),
    fact("goal", "Goal", goalText, goalText ? "customer" : "missing", "Used for your recommendation. Saved only when you create a campaign."),
    fact("channels", "Channels you are planning for", channelList.join(", "), channelInfo.source, "Planning only. No account is connected and nothing is published."),
  ];

  const actions = [];
  if (!profileComplete && !profileUnknown) {
    const resume = onboarding && onboarding.status === "in_progress" && Number.isInteger(onboarding.current_step) ? onboarding.current_step : null;
    actions.push({ id: "profile", title: resume !== null ? "Continue your setup" : "Complete your business profile", detail: resume !== null ? "Pick up where you left off. Your saved answers are waiting." : "Tell us what the business does, choose your sector and channels, then confirm your setup.", target: { view: "onboarding", stage: resume !== null ? resume : 2 } });
  }
  if (!goalText && !camp) actions.push({ id: "goal", title: "Tell us your goal", detail: "One clear outcome gives your first recommendation a focus.", target: { view: "onboarding", stage: 3 } });
  if (goalText && !hasRecommendation && !camp) actions.push({ id: "recommend", title: "Get your first recommendation", detail: "Review a suggested campaign shape before anything is created.", target: { view: "onboarding", stage: 6 } });
  if (hasRecommendation && !camp) actions.push({ id: "create", title: "Create your first campaign", detail: "Save the recommended campaign. Nothing is scheduled or published.", target: { view: "studio" } });
  if (camp) {
    if (camp.counts.draft > 0) actions.push({ id: "generate", title: "Generate drafts", detail: `${camp.counts.draft} item${camp.counts.draft === 1 ? "" : "s"} ready to generate.`, target: { view: "studio" } });
    if (camp.counts.review > 0) actions.push({ id: "review", title: "Review creative", detail: `${camp.counts.review} item${camp.counts.review === 1 ? "" : "s"} waiting for your review. Approval does not publish.`, target: { view: "studio" } });
    if (camp.counts.approved > 0) actions.push({ id: "publish", title: "Hand off approved content", detail: "Approved content needs manual publication. BizGenie does not publish it for you.", target: { view: "studio" } });
    actions.push({ id: "calendar", title: "Open the campaign calendar", detail: "See scheduled or published activity recorded for this campaign.", target: { view: "calendar" } });
  }

  const model = {
    brand: { name, hasName, source: nameSource, sourceLabel: SOURCE_LABEL[nameSource], initial: hasName ? name.slice(0, 1).toUpperCase() : "?" },
    sector: { key: sector.key, label: sectorEntry.label, source: sectorSource, sourceLabel: SOURCE_LABEL[sectorSource] || SOURCE_LABEL.missing, accent: sectorEntry.accent },
    goal: { value: goalText, source: goalText ? "customer" : "missing" },
    plannedChannels: channelList,
    profile: { complete: profileComplete, unknown: profileUnknown, confirmed: onboardingCompleted, rows },
    campaign: camp,
    campaigns: summariseCampaigns(campaigns),
    nextActions: actions,
    guidance: { sectorLabel: sectorEntry.label, angles: guidanceFor(sector.key), note: "General guidance for this kind of business. It is not generated content, a claim about your business, or a result." },
    analytics: { status: "none", text: "No measured results are recorded yet. BizGenie shows only results you have entered or a connected source has supplied." },
    title: hasName ? `Welcome back, ${name}.` : "Welcome to your workspace.",
  };
  model.text = collectText(model);
  return model;
}

// Every customer-visible string, for the isolation tests. Colour values and keys are not text.
function collectText(model) {
  const out = [];
  const walk = (value, skip) => {
    if (value == null || skip) return;
    if (typeof value === "string") { out.push(value); return; }
    if (Array.isArray(value)) { value.forEach((v) => walk(v)); return; }
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, ["accent", "key", "id", "target", "source", "counts", "text_skip"].includes(k));
  };
  walk({ ...model, text: undefined });
  return out;
}
