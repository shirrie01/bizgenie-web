// Industry-aware presentation model for the isolated V3 Studio preview (BG-STUDIO-007-FE).
//
// One place decides what the workspace, Campaign Studio and Calendar show for a given sector, goal and channel
// choice. It is pure (no DOM, no network, no storage), so it can be unit-tested and the UI only renders it.
//
// Honesty rules encoded here:
//  - Every sector profile is an ILLUSTRATIVE fixture. Nothing in it is customer data or a generated creative.
//  - The only brand name that ever appears is the one the customer typed. No demonstration brand is substituted.
//  - Copy makes no product, health, price, performance or ingredient claim.
//  - An unrecognised or missing sector falls back to a neutral, brand-safe profile.

export const SECTOR_ORDER = ["leasing", "perfume", "aesthetics", "beverage", "charity", "takeaway"];
export const CHANNEL_ORDER = ["Instagram", "TikTok", "Facebook", "LinkedIn", "Email", "Website"];

const CHANNEL_ICON = { Instagram: "◎", TikTok: "▶", Facebook: "f", LinkedIn: "in", Email: "✉", Website: "◎" };
// Deterministic example heights for the illustrative channel comparison. Not analytics.
const CHANNEL_EXAMPLE = { Instagram: 78, TikTok: 96, Facebook: 54, LinkedIn: 39, Email: 48, Website: 62 };
const CHANNEL_COLOUR = { Instagram: "#f03887", TikTok: "#1bbed3", Facebook: "#267bea", LinkedIn: "#9b71dd", Email: "#47b997", Website: "#d98b42" };

const tone = (a, b, c, glow, accent, fa, fb, fc) => ({ a, b, c, glow, accent, feature: [fa, fb, fc] });

export const PROFILES = {
  neutral: {
    key: "neutral", label: "Not specified", short: "your business", keywords: null,
    palette: tone("#062f2a", "#0b4943", "#0f5f56", "#2aa58f", "#a7f3d6", "#cfeee6", "#b5ddd6", "#d6e8de"),
    scene: { kind: "symbols", symbols: ["spark", "calendar", "bag"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · CONCEPT", campaignKind: "First campaign",
    headline: ["A clear next step", "for your business."], emphasis: "",
    lead: "Review a campaign direction built only from what you told us, before any creative is made.",
    featured: { title: ["A clear direction,", "ready to review."], lead: "Three channel directions, one coherent story." },
    concepts: [
      { title: "Introduce your business", symbol: "spark", tone: "teal" },
      { title: "Make your offer obvious", symbol: "bag", tone: "coral" },
      { title: "Plan what goes out", symbol: "calendar", tone: "lavender" },
    ],
    schedule: ["Introduce your business", "Your offer, explained", "What to expect next"],
    signature: [],
  },
  leasing: {
    key: "leasing", label: "Vehicle leasing", short: "vehicle leasing", keywords: /\b(leas(e|es|ing)|vehicles?|cars?|motors?|automotive|fleet|vans?)\b/i,
    palette: tone("#0d1b2e", "#16304f", "#1f3f66", "#3a7bb8", "#9fd0ff", "#c9ddf2", "#a9c3e4", "#d3d9ee"),
    scene: { kind: "symbols", symbols: ["car", "calendar", "spark"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · LEASE ENQUIRIES", campaignKind: "Lease enquiries",
    headline: ["A clearer way", "to lease."], emphasis: "to lease.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["Clear terms,", "confident enquiries."], lead: "Three channel directions, one clear lease story." },
    concepts: [
      { title: "A clearer way to lease", symbol: "car", tone: "teal" },
      { title: "Know what you are agreeing to", symbol: "calendar", tone: "coral" },
      { title: "Ask about your next car", symbol: "spark", tone: "lavender" },
    ],
    schedule: ["How leasing works", "Clear terms explained", "Ask about your next lease"],
    signature: ["lease", "leasing", "vehicle", "car"],
  },
  perfume: {
    key: "perfume", label: "Fragrance & perfume", short: "fragrance", keywords: /\b(perfum\w*|fragrances?|scents?|cologne|parfum|eau de)\b/i,
    palette: tone("#2a1030", "#4a1d4f", "#6a2a5c", "#b0497f", "#ffc6df", "#f3d5e6", "#e3bfd9", "#f0d9e8"),
    scene: { kind: "symbols", symbols: ["perfume", "spark", "bubble"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · FRAGRANCE DISCOVERY", campaignKind: "Fragrance discovery",
    headline: ["A signature worth", "remembering."], emphasis: "remembering.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["A signature scent,", "told as a story."], lead: "Three channel directions, one fragrance story." },
    concepts: [
      { title: "A signature worth remembering", symbol: "perfume", tone: "teal" },
      { title: "Notes that tell a story", symbol: "spark", tone: "coral" },
      { title: "Find your scent", symbol: "bubble", tone: "lavender" },
    ],
    schedule: ["The fragrance story", "Notes and craft", "Discovery set reminder"],
    signature: ["fragrance", "perfume", "scent", "notes"],
  },
  aesthetics: {
    key: "aesthetics", label: "Aesthetics clinic", short: "aesthetics clinic", keywords: /\b(aesthetic\w*|clinics?|skin(care)?|beauty|cosmetic\w*|facials?|salons?)\b/i,
    palette: tone("#2f2a24", "#4b4036", "#6a5646", "#b98d6d", "#f5d9c2", "#f5e6dc", "#ecd5c7", "#e8e0d4"),
    scene: { kind: "symbols", symbols: ["flower", "spark", "calendar"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · CONSULTATION ENQUIRIES", campaignKind: "Consultation enquiries",
    headline: ["Care begins with", "a conversation."], emphasis: "a conversation.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["Personal care,", "explained simply."], lead: "Three channel directions, one practitioner-led story." },
    concepts: [
      { title: "Care begins with a conversation", symbol: "flower", tone: "teal" },
      { title: "Confidence in every detail", symbol: "spark", tone: "coral" },
      { title: "Book a personal consultation", symbol: "calendar", tone: "lavender" },
    ],
    schedule: ["Meet the practitioner", "What a consultation involves", "Consultation reminder"],
    signature: ["aesthetics", "clinic", "consultation", "practitioner"],
  },
  beverage: {
    key: "beverage", label: "Soft drinks & beverages", short: "drinks brand", keywords: /\b(soft drinks?|drinks?|beverages?|soda|juice|cola|squash|fizzy)\b/i,
    palette: tone("#071f2e", "#092e42", "#182a4a", "#307da7", "#8de2d1", "#b8e6e5", "#a4cbe8", "#d2b8d9"),
    scene: { kind: "cans", symbols: ["can", "bubble", "bottle"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · FLAVOUR DISCOVERY", campaignKind: "Flavour discovery",
    headline: ["A flavour worth", "discovering."], emphasis: "discovering.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["Bold first", "impression."], lead: "Three channel directions, one coherent brand story." },
    concepts: [
      { title: "A flavour worth discovering", symbol: "can", tone: "teal" },
      { title: "The details behind the taste", symbol: "bubble", tone: "coral" },
      { title: "Find your next favourite", symbol: "bottle", tone: "lavender" },
    ],
    schedule: ["The new flavour", "Behind the taste", "Where to find it"],
    signature: ["flavour", "drink", "drinks", "cans", "taste", "fonzo"],
  },
  charity: {
    key: "charity", label: "Charity & community", short: "charity", keywords: /\b(charit\w*|non-?profit|foundations?|volunteer\w*|fundrais\w*|community (group|organi[sz]ation))\b/i,
    palette: tone("#3a1220", "#6a1f3a", "#8a2f45", "#d86a6a", "#ffd0b8", "#f9dcd2", "#f1c2b8", "#f6d9bf"),
    scene: { kind: "symbols", symbols: ["heart", "people", "hands"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · COMMUNITY IMPACT", campaignKind: "Community impact",
    headline: ["Every act makes", "a difference."], emphasis: "a difference.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["Show the difference", "people make."], lead: "Three channel directions, one community story." },
    concepts: [
      { title: "Every act makes a difference", symbol: "heart", tone: "teal" },
      { title: "See the difference you can make", symbol: "people", tone: "coral" },
      { title: "Join something meaningful", symbol: "hands", tone: "lavender" },
    ],
    schedule: ["Local impact story", "Voices from the community", "Ways to get involved"],
    signature: ["charity", "donate", "volunteer", "volunteers", "community"],
  },
  takeaway: {
    key: "takeaway", label: "Independent takeaway", short: "takeaway", keywords: /\b(takeaways?|take-?away|restaurants?|caf[eé]s?|food|kitchens?|pizza|catering)\b/i,
    palette: tone("#2a1a0b", "#4a2b0f", "#6e3d12", "#d68a2f", "#ffd9a0", "#fbe5c4", "#f1cf9f", "#f4dcb8"),
    scene: { kind: "symbols", symbols: ["plate", "steam", "bag"] },
    eyebrow: "YOUR FEATURED CAMPAIGN · DIRECT ORDERS", campaignKind: "Direct orders",
    headline: ["Your Friday", "favourite, sorted."], emphasis: "favourite, sorted.",
    lead: "Discover the campaign direction, inspect its creative and review channel fit before approval.",
    featured: { title: ["Fresh from", "our kitchen."], lead: "Three channel directions, one local food story." },
    concepts: [
      { title: "Your Friday favourite, sorted", symbol: "plate", tone: "teal" },
      { title: "Fresh from our kitchen", symbol: "steam", tone: "coral" },
      { title: "Make tonight delicious", symbol: "bag", tone: "lavender" },
    ],
    schedule: ["Behind the counter", "Fresh from the kitchen", "Order direct"],
    signature: ["takeaway", "kitchen", "order direct", "delicious"],
  },
};

// Studio post cards keep their long-standing fixtures (three directions per sector).
export const POST_FIXTURES = {
  neutral: { titles: ["A clear next step.", "What you offer, simply.", "What happens next."], kickers: ["YOUR BUSINESS", "YOUR OFFER", "NEXT STEP"], foot: ["Awareness · introduce the business", "Trust · explain the offer", "Action · a clear next step"], shapes: ["spark", "bag", "calendar"] },
  charity: { titles: ["Every act makes a difference.", "See the difference you can make.", "Join something meaningful."], kickers: ["LOCAL IMPACT", "BEHIND THE MISSION", "COMMUNITY ACTION"], foot: ["Awareness · community stories", "Trust · outcomes and voices", "Action · volunteer or donate"], shapes: ["heart", "people", "hands"] },
  takeaway: { titles: ["Your Friday favourite, sorted.", "Fresh from our kitchen.", "Make tonight delicious."], kickers: ["LOCAL FOOD STORY", "BEHIND THE COUNTER", "ORDER DIRECT"], foot: ["Discovery · local appetite", "Trust · real food preparation", "Action · direct orders"], shapes: ["plate", "steam", "bag"] },
  beverage: { titles: ["A flavour worth discovering.", "The details behind the taste.", "Find your next favourite."], kickers: ["NEW FLAVOUR", "PRODUCT STORY", "RETAIL DISCOVERY"], foot: ["Awareness · new flavour", "Trust · verified ingredients", "Action · store discovery"], shapes: ["can", "bubble", "bottle"] },
  leasing: { titles: ["A clearer way to lease.", "Know what you are agreeing to.", "Ask about your next car."], kickers: ["LEASE VALUE", "CLEAR TERMS", "ENQUIRE"], foot: ["Awareness · lease value", "Trust · clear terms", "Action · lease enquiry"], shapes: ["car", "calendar", "spark"] },
  perfume: { titles: ["A signature worth remembering.", "Notes that tell a story.", "Find your scent."], kickers: ["NEW SCENT", "THE STORY", "DISCOVER"], foot: ["Awareness · new fragrance", "Trust · craft and notes", "Action · discovery set"], shapes: ["perfume", "spark", "bubble"] },
  aesthetics: { titles: ["Care begins with a conversation.", "Confidence in every detail.", "Book a personal consultation."], kickers: ["PERSONAL CARE", "PRACTITIONER STORY", "CONSULTATION"], foot: ["Awareness · service introduction", "Trust · practitioner credentials", "Action · consultation enquiry"], shapes: ["flower", "spark", "calendar"] },
};

const GOALS = {
  "Get more customers": { metric: "Potential reach", action: ["Reach new customers", "Shape first-time awareness concepts", "studio"] },
  "Increase online sales": { metric: "Conversions", action: ["Drive online sales", "Plan offers that lead to your website or shop", "studio"] },
  "Increase repeat purchases": { metric: "Engagement", action: ["Bring customers back", "Plan follow-up and loyalty content", "calendar"] },
  "Build brand awareness": { metric: "Potential reach", action: ["Build recognition", "Plan a consistent story across channels", "studio"] },
  "Launch a product or service": { metric: "Link clicks", action: ["Plan the launch", "Sequence teaser, launch and follow-up content", "calendar"] },
  "Support a specific promotion": { metric: "Conversions", action: ["Promote your offer", "Plan content around your offer dates", "calendar"] },
  "Not sure yet": { metric: "", action: ["Choose a goal", "Pick one outcome so the plan has a focus", "onboard"] },
};
export const GOAL_NAMES = Object.keys(GOALS);

export const sectorOptions = () => [{ value: "", label: "Choose from what I typed" }, { value: "neutral", label: "Not specified" }, ...SECTOR_ORDER.map((key) => ({ value: key, label: PROFILES[key].label }))];

const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

// Which sector the preview illustrates, and why. An explicit choice always wins. Otherwise the sector is
// inferred (deterministically, first match in SECTOR_ORDER) from the sector text, then the business name.
// Nothing matched means the neutral profile; no sector is ever guessed.
export function resolveSector({ business = "", industryText = "", choice = "" } = {}) {
  const picked = clean(choice);
  if (picked && PROFILES[picked]) return { key: picked, source: "chosen" };
  for (const text of [clean(industryText), clean(business)]) {
    if (!text) continue;
    for (const key of SECTOR_ORDER) if (PROFILES[key].keywords.test(text)) return { key, source: "inferred" };
  }
  return { key: "neutral", source: "none" };
}

export const brandMark = (name) => clean(name).split(" ")[0].toUpperCase().slice(0, 9);

export function orderedChannels(channels) {
  const set = new Set(channels || []);
  return CHANNEL_ORDER.filter((name) => set.has(name));
}

// The whole workspace as plain data. `text` lists every customer-visible string, which the regression tests
// scan to prove one sector's fixture cannot appear under another.
export function buildWorkspace({ business = "", industryText = "", sectorChoice = "", goal = "", channels = [], voice = "", messages = [] } = {}) {
  const name = clean(business);
  const hasBrand = name.length > 0;
  const { key, source } = resolveSector({ business: name, industryText, choice: sectorChoice });
  const profile = PROFILES[key];
  const picked = GOALS[goal] ? goal : "Not sure yet";
  const plan = GOALS[picked];
  const chans = orderedChannels(channels);
  const brandLabel = hasBrand ? name : "your business";
  const display = name.length > 60 ? name.slice(0, 57) + "…" : name;
  const lines = key === "neutral" && hasBrand ? ["A clear next step", `for ${display}.`] : profile.headline;
  const view = {
    sector: key, sectorLabel: profile.label, sectorSource: source, hasBrand, brandName: name, goal: picked, goalChosen: picked !== "Not sure yet",
    palette: profile.palette,
    title: hasBrand ? `Your growth plan for ${display}.` : "Your growth plan.",
    eyebrow: hasBrand ? `MISSION CONTROL / ${display.toUpperCase()} · SIMULATED EXAMPLE` : "MISSION CONTROL / SIMULATED EXAMPLE",
    subtitle: `Illustrative workspace for ${profile.short === "your business" ? "your business" : profile.short}. Nothing here is your data, and nothing is generated or published.`,
    hero: { eyebrow: profile.eyebrow, lines, emphasis: key === "neutral" ? "" : profile.emphasis, lead: plan.action[1] && picked !== "Not sure yet" ? `Focus: ${picked}. ${profile.lead}` : profile.lead },
    scene: { kind: profile.scene.kind, symbols: profile.scene.symbols, mark: key === "beverage" && hasBrand ? brandMark(name) : "" },
    campaign: { name: hasBrand ? `${display} · ${profile.campaignKind}` : profile.campaignKind, note: "Illustrative creative direction", channels: chans },
    featured: profile.featured,
    concepts: profile.concepts.map((c, i) => ({ ...c, channel: chans.length ? chans[i % chans.length] : "No channel selected" })),
    kpis: [["Potential reach", "128.4K", "▂ ▄ ▃ ▅ ▆ ▄ ▇ █", ""], ["Engagement", "12.6K", "▁ ▂ ▅ ▄ ▆ ▅ ▇ █", "purple"], ["Link clicks", "3.4K", "▂ ▃ ▄ ▂ ▅ ▃ ▅ █", "orange"], ["Conversions", "842", "▁ ▂ ▃ ▅ ▄ ▆ ▇ █", "blue"]].map(([label, value, spark, color]) => ({ label, value, spark, color, focus: label === plan.metric })),
    actions: [
      { title: plan.action[0], desc: plan.action[1], view: plan.action[2], symbol: "◆" },
      { title: "Review creative", desc: "Inspect the three concepts", view: "studio", symbol: "✳" },
      { title: "Plan content", desc: "Illustrative schedule", view: "calendar", symbol: "▦" },
    ],
    chart: chans.map((c) => ({ channel: c, height: CHANNEL_EXAMPLE[c], colour: CHANNEL_COLOUR[c] })),
    schedule: profile.schedule.map((title, i) => ({ day: String(3 + i).padStart(2, "0"), title, channel: chans.length ? chans[i % chans.length] : "No channel selected", icon: chans.length ? CHANNEL_ICON[chans[i % chans.length]] : "–" })),
    brand: { voice: clean(voice), messages: (messages || []).map(clean).filter(Boolean) },
    notice: "Illustrative example only. Campaigns, visuals, dates, performance and channel states are examples. No customer accounts are connected, and no content is generated or published.",
  };
  view.text = collectText(view);
  return view;
}

function collectText(view) {
  const out = [];
  const walk = (value, skip) => {
    if (value == null || skip) return;
    if (typeof value === "string") { out.push(value); return; }
    if (Array.isArray(value)) { value.forEach((v) => walk(v)); return; }
    if (typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, ["palette", "scene", "text", "sector", "sectorSource", "tone", "symbol", "colour", "height", "spark", "color", "view", "icon", "key"].includes(k));
  };
  walk(view);
  return out;
}

export function studioPosts({ sector = "neutral", channels = [] } = {}) {
  const fx = POST_FIXTURES[sector] || POST_FIXTURES.neutral;
  return orderedChannels(channels).slice(0, 3).map((channel, i) => ({ channel, kicker: fx.kickers[i], title: fx.titles[i], foot: fx.foot[i], shape: fx.shapes[i] }));
}

export function calendarEvents(view) {
  const labels = [...view.schedule.map((s) => s.title), ...view.concepts.slice(0, 2).map((c) => c.title)];
  return [3, 8, 14, 20, 25].map((day, i) => ({ day, label: labels[i], alt: day % 2 === 1 }));
}

// Words that belong to one sector's fixtures and must never appear in another's (regression-test input).
export const signatureTerms = (key) => (PROFILES[key] ? PROFILES[key].signature : []);
