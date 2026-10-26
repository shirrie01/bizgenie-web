// Goal-first strategy (BG-STUDIO-022-FE). The strategy begins with the customer's commercial objective, then reads it through their industry.
// General guidance only: no customer, price, claim, forecast or result is generated here. Nothing is persisted (the backend has no objective field);
// every resolution says whether it was CHOSEN by the customer or SUGGESTED from their words, and a suggestion is always overridable.
export const OBJECTIVES = {
  awareness: { label: "Brand awareness", measure: ["reach", "impressions", "views"] },
  leads: { label: "Lead generation", measure: ["leads", "clicks"] },
  traffic: { label: "Website traffic", measure: ["clicks", "views"] },
  sales: { label: "Product sales", measure: ["sales", "conversions", "revenue"] },
  bookings: { label: "Appointment bookings", measure: ["conversions", "leads"] },
  retention: { label: "Customer retention", measure: ["conversions", "clicks"] },
  launch: { label: "Product launch", measure: ["reach", "clicks", "sales"] },
  distributor: { label: "Distributor or wholesale acquisition", measure: ["leads", "conversions"] },
};

// Words that point at an objective. Distributor/wholesale is tested FIRST: a wholesale beverage campaign is trade acquisition, not a consumer launch.
const RULES = [
  ["distributor", /\b(wholesale|distribut\w*|stockists?|trade (buyers?|accounts?|customers?)|retailers?|resellers?|b2b|on-trade|off-trade|supply (to|deal)s?)\b/i],
  ["bookings", /\b(book(ing|ings|ed)?|appointments?|consultations?|reserv\w*|slots?)\b/i],
  ["retention", /\b(retain|retention|repeat (customers?|orders?|buyers?)|loyal\w*|win[- ]?back|re-?engage|renewals?|churn)\b/i],
  ["launch", /\b(launch(ing|es|ed)?|new (product|range|flavour|flavor|scent|service)|introduc\w+ (our|the) new|release)\b/i],
  ["leads", /\b(leads?|enquir\w+|inquir\w+|sign[- ]?ups?|quotes?|calls?|contact (us|form))\b/i],
  ["sales", /\b(sales?|sell|selling|orders?|purchases?|buy|revenue|checkout)\b/i],
  ["traffic", /\b(traffic|visits?|visitors?|website|landing page|clicks?)\b/i],
  ["awareness", /\b(awareness|known|reach|visibility|get (our )?name out|brand)\b/i],
];
export function suggestObjective(text) {
  const t = String(text || "").trim();
  if (!t) return { objective: null, why: "", matched: "" };
  for (const [key, re] of RULES) { const m = t.match(re); if (m) return { objective: key, why: `Your words mention "${m[0]}".`, matched: m[0] }; }
  return { objective: null, why: "", matched: "" };
}

// Per industry reading of each objective: who the customer is, the typical offer shape, measurement approach and a caution. Plain language.
// `audience` is a description of the TYPE of audience, not a claim about the customer's real audience, which comes from their Brand Brain.
const READ = {
  leasing: {
    leads: { audience: "Businesses or individuals comparing lease terms", offer: "A no-obligation lease quote or call back", measure: "Quote requests and calls", caution: "Show terms and costs only as your business has approved them." },
    awareness: { audience: "Drivers and fleet managers who have not heard of you", offer: "A clear explanation of how leasing works", measure: "Reach, views and profile visits", caution: "Awareness is not enquiries; judge it on reach, not on leads." },
    distributor: { audience: "Brokers, dealers or fleet partners", offer: "A partner or referral arrangement", measure: "Partner enquiries", caution: "Partner terms are not the same as consumer lease terms." },
    default: { audience: "People deciding how to run a vehicle", offer: "One clear next step", measure: "Enquiries through your agreed route", caution: "Do not publish prices or terms you have not approved." },
  },
  professional_services: {
    leads: { audience: "Owners or managers with a problem you solve", offer: "An introductory conversation or assessment", measure: "Enquiries and booked calls", caution: "Do not promise outcomes for a client's matter." },
    bookings: { audience: "Prospects ready to speak to you", offer: "A booked consultation", measure: "Booked consultations", caution: "Make the booking route work before promoting it." },
    awareness: { audience: "Businesses that might need you later", offer: "Useful explanations of how you help", measure: "Reach and engagement", caution: "Trust builds slowly; do not expect enquiries from awareness alone." },
    default: { audience: "Decision-makers in your target businesses", offer: "A clear next step", measure: "Enquiries", caution: "Claims must be ones you can substantiate." },
  },
  aesthetics: {
    bookings: { audience: "People considering a treatment", offer: "A booked consultation", measure: "Booked consultations", caution: "Treatment claims and before/after material need your own approved evidence and consent." },
    leads: { audience: "People considering a treatment who want to ask first", offer: "A free consultation or question", measure: "Enquiries", caution: "Advertising rules for treatments are strict; use only wording you have approved." },
    awareness: { audience: "Local people who have not heard of your clinic", offer: "Introduce the clinic and its team", measure: "Reach and profile visits", caution: "Do not imply results you cannot evidence." },
    default: { audience: "Local people interested in treatments", offer: "A consultation", measure: "Booked consultations", caution: "Use only claims you have approved." },
  },
  perfume: {
    sales: { audience: "Shoppers buying for themselves or as gifts", offer: "A product, sample or discovery set", measure: "Orders and click-throughs", caution: "Describe notes and craft you can verify." },
    launch: { audience: "Existing followers and new fragrance fans", offer: "The new fragrance and how to get it", measure: "Reach, clicks and orders", caution: "A launch needs a date and a place to buy before it is promoted." },
    awareness: { audience: "People who love fragrance but do not know you", offer: "The story behind the fragrance", measure: "Reach and saves", caution: "Awareness is not sales." },
    default: { audience: "Fragrance buyers and gift givers", offer: "A sample or discovery set", measure: "Orders and sample requests", caution: "Do not invent reviews or ingredients." },
  },
  beverage: {
    distributor: { audience: "Trade buyers: distributors, wholesalers, bars, shops and restaurants (not the drinking public)", offer: "A trade sample, price list or listing conversation", measure: "Trade enquiries, sample requests and new stockists", caution: "This is business-to-business acquisition. Do not treat it as a consumer product launch or aim consumer advertising at trade buyers." },
    launch: { audience: "Drinkers and shops who have not yet tried the new drink", offer: "The new drink and where to find it", measure: "Reach, clicks and stockist visits", caution: "If your customers are trade buyers, choose Distributor or wholesale acquisition instead." },
    sales: { audience: "Drinkers buying online or in shops", offer: "A purchase, bundle or tasting set", measure: "Orders and click-throughs", caution: "Alcohol marketing has audience and wording rules; confirm yours before publishing." },
    awareness: { audience: "People who might try the drink", offer: "The brand and how it tastes", measure: "Reach and views", caution: "Awareness is not sales." },
    default: { audience: "Drinkers or trade buyers", offer: "One clear next step", measure: "Enquiries or orders", caution: "Decide whether your buyer is a consumer or a trade customer first." },
  },
};
const GENERIC = { audience: "The people your Brand Brain describes", offer: "One clear next step", measure: "The result you choose to track", caution: "Use only information you can stand behind." };

export const INDUSTRIES = ["leasing", "professional_services", "aesthetics", "perfume", "beverage"];
export function readObjective(sector, objective) {
  const o = OBJECTIVES[objective]; if (!o) return null;
  const table = READ[sector]; const r = table ? (table[objective] || table.default) : GENERIC;
  return { objective, objectiveLabel: o.label, sector: READ[sector] ? sector : "neutral", ...r, metrics: o.measure };
}

// The strategy summary the screen shows. Every field says where it came from; nothing is forecast.
// context: { objective, objectiveSource: "chosen"|"suggested", sector, sectorSource, brainFacts: {audience, offer(cta)}, channels: [] }
export function buildStrategy(context) {
  const read = readObjective(context.sector, context.objective);
  if (!read) return null;
  const brain = context.brainFacts || {};
  const customerAudience = String(brain.audience || "").trim();
  const customerOffer = String(brain.cta || brain.offer || "").trim();
  const channels = (context.channels || []).filter(Boolean);
  const assumptions = [];
  if (!customerAudience) assumptions.push("Your Brand Brain has no audience yet, so the audience above is a general description for your industry.");
  if (!customerOffer) assumptions.push("No offer or call to action is saved, so BizGenie will not invent one. Add yours before creating content.");
  if (!channels.length) assumptions.push("No channels are chosen yet.");
  if (context.sectorSource !== "chosen") assumptions.push("Your industry was inferred from your own description. Change it if it is wrong.");
  return {
    objective: read.objectiveLabel, objectiveSource: context.objectiveSource || "chosen",
    targetCustomer: customerAudience ? { text: customerAudience, source: "Your Brand Brain" } : { text: read.audience, source: "General guidance for your industry" },
    offer: customerOffer ? { text: customerOffer, source: "Your Brand Brain" } : { text: read.offer, source: "General guidance, not your approved offer" },
    channels: channels.length ? channels : [],
    creativeRationale: `Lead with ${read.offer.toLowerCase()}. ${read.caution}`,
    measurement: `${read.measure}. Judged over a period you choose. Results are labelled by where they came from.`,
    metrics: read.metrics,
    assumptions,
    evidence: [`Industry reading: ${read.sector === "neutral" ? "general" : read.sector.replaceAll("_", " ")}`, `Objective: ${read.objectiveLabel}`],
    nextAction: customerOffer && customerAudience ? "Create the first campaign content for this goal." : "Complete your Brand Brain so the strategy uses your own audience and offer.",
    forecast: null, // never fabricated
  };
}
