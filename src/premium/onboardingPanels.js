// BG-WEB-ONBOARDING-MOCKUP (Issue #85): the founder's six-panel onboarding presented over the EXISTING seven persisted stages.
// The persisted position is `onboarding.current_step`, an integer index into the seven stages in PremiumOnboarding.STAGES (0 welcome, 1 identity, 2 about,
// 3 customers+goal, 4 channels, 5 Brand Brain, 6 recommendation). Those indexes are a stored contract, so they are NEVER renumbered or reordered: a saved
// progress of 4 still means "channels". The six panels only GROUP them and set the order the customer walks them in (Brand Brain before Channels).
export const STAGE_COUNT = 7;
export const PANELS = Object.freeze([
  { id: "welcome", label: "Welcome", stages: [0] },
  { id: "business", label: "Your business", stages: [1, 2] },
  { id: "goals", label: "Your goals", stages: [3] },
  { id: "brand", label: "Brand setup", stages: [5] },
  { id: "channels", label: "Channels", stages: [4] },
  { id: "review", label: "Review proposal", stages: [6] },
]);
export const ORDER = Object.freeze(PANELS.flatMap((p) => p.stages)); // walking order of the stored stage indexes
export const panelIndexOfStage = (stage) => PANELS.findIndex((p) => p.stages.includes(stage));
export const nextStage = (stage) => { const i = ORDER.indexOf(stage); return i < 0 || i === ORDER.length - 1 ? stage : ORDER[i + 1]; };
export const prevStage = (stage) => { const i = ORDER.indexOf(stage); return i <= 0 ? stage : ORDER[i - 1]; };
// "Part 1 of 2" inside a panel that groups several stored stages (Your business).
export const partOfPanel = (stage) => { const p = PANELS[panelIndexOfStage(stage)]; return p && p.stages.length > 1 ? { index: p.stages.indexOf(stage) + 1, of: p.stages.length } : null; };

// Objectives a customer can pick (Issue #85, panel 3). A pick is saved as the goal TEXT (the existing draft `goal`, used for the first recommendation); no new stored field.
export const OBJECTIVES = Object.freeze([
  { id: "customers", label: "Get more customers", text: "Get more customers for my business" },
  { id: "sales", label: "Increase online sales", text: "Increase online sales" },
  { id: "awareness", label: "Build awareness", text: "Build awareness of my brand" },
  { id: "launch", label: "Launch something new", text: "Launch a new product or service" },
  { id: "promotion", label: "Promote an offer", text: "Promote a special offer or event" },
  { id: "inspiration", label: "Get content ideas", text: "Get fresh content ideas and inspiration" },
]);
const norm = (s) => String(s || "").trim().toLowerCase();
// A goal "starts with" an objective only at a word boundary, so "...my business owners" is the customer's own sentence, not the objective plus a stray word.
const startsWithObjective = (goal, o) => { const g = norm(goal), t = norm(o.text); return g.startsWith(t) && (g.length === t.length || !/[a-z0-9]/.test(g[t.length])); };
export const objectiveForGoal = (goal) => OBJECTIVES.find((o) => startsWithObjective(goal, o)) || null;
// Put the chosen objective at the start of the goal, keeping anything the customer added after a previous objective.
export function applyObjective(goal, objective) {
  const current = objectiveForGoal(goal);
  const rest = String(goal || "").trim().slice(current ? current.text.length : 0).replace(/^[\s.,;:–—-]+/, "").trim();
  return rest ? `${objective.text}. ${rest}` : objective.text;
}

// Channels the design shows, and whether the Studio may offer a Connect action for each. Connect is offered only when the build's social feature is verified
// (compatibility gate) AND the platform is one the verified API revision supports; otherwise the card says it is unavailable. Nothing here connects anything.
export const CONNECTABLE_PLATFORMS = Object.freeze({ instagram: "instagram", tiktok: "tiktok", facebook: "facebook", linkedin: "linkedin" });
export function channelConnection(label, { socialEnabled, providers }) {
  const key = norm(label); const platform = CONNECTABLE_PLATFORMS[key];
  if (!platform) return { offered: false, text: key === "email" || key === "website" ? "Nothing to connect: planning only" : "Not connected" };
  if (socialEnabled && Array.isArray(providers) && providers.includes(platform)) return { offered: true, text: "Not connected yet · connect in Accounts and publishing" };
  return { offered: false, text: "Not connected · connecting isn't available in this version yet" };
}

// Brand setup cards (panel 4): what is actually stored in the Brand Brain, each opening the full Brand Brain editor. The logo has no upload path in this build, so it says so.
export const BRAND_CARDS = Object.freeze([
  { id: "voice", label: "Voice", fieldIds: ["tone"], empty: "No tone of voice yet" },
  { id: "messages", label: "Key messages", fieldIds: ["differentiators"], empty: "Nothing yet about what sets you apart" },
  { id: "visual", label: "Colours and style", fieldIds: ["colours", "photography_style"], empty: "No colours or visual style yet" },
]);
export const LOGO_NOTE = "Logo upload isn't available in this version yet. Nothing is uploaded or stored.";
export function brandCardSummary(card, values) {
  const parts = card.fieldIds.map((id) => String((values && values[id]) || "").trim()).filter(Boolean).map((t) => t.split("\n").filter(Boolean).slice(0, 3).join(", "));
  return parts.length ? parts.join(" · ") : card.empty;
}
