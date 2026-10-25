// Sector awareness for the production Premium Studio (BG-STUDIO-008-FE).
//
// Scope: decides which GENERAL guidance to show and how to word it. It contains no customer, brand, metric,
// campaign or creative fixtures. A sector is never persisted (the backend has no field for it), so every
// resolution carries a source the UI must show: "chosen" by the customer, "inferred" from their own text, or
// "none" (neutral fallback). Inference is keyword-based, deterministic and always overridable.
//
// The keyword rules deliberately mirror studio-preview/v3/industry-profiles.js; a parity test keeps them aligned.

import { isProfessionalSectorPersisted } from "./flag";

// "professional_services" is last, so a business that matches a more specific sector (for example fleet consultancy) keeps that one.
export const SECTOR_ORDER = ["leasing", "perfume", "aesthetics", "beverage", "charity", "takeaway", "professional_services"];

const NEUTRAL_ANGLES = [
  { stage: "Awareness", text: "Introduce the business and who it is for." },
  { stage: "Trust", text: "Explain the offer simply, using only information you can stand behind." },
  { stage: "Action", text: "Make the next step for a customer obvious." },
];

export const SECTORS = {
  neutral: { key: "neutral", label: "Not specified", short: "your business", keywords: null, accent: "#0b4943", angles: NEUTRAL_ANGLES },
  leasing: {
    key: "leasing", label: "Vehicle leasing", short: "vehicle leasing", accent: "#1f3f66",
    keywords: /\b(leas(e|es|ing)|vehicles?|cars?|motors?|automotive|fleet|vans?)\b/i,
    angles: [
      { stage: "Awareness", text: "Explain how leasing works in plain language." },
      { stage: "Trust", text: "Make terms and costs easy to find and understand." },
      { stage: "Action", text: "Invite a lease enquiry with a single clear next step." },
    ],
  },
  perfume: {
    key: "perfume", label: "Fragrance & perfume", short: "fragrance", accent: "#6a2a5c",
    keywords: /\b(perfum\w*|fragrances?|scents?|cologne|parfum|eau de)\b/i,
    angles: [
      { stage: "Awareness", text: "Introduce the fragrance through its story." },
      { stage: "Trust", text: "Describe the craft and notes you can verify." },
      { stage: "Action", text: "Invite discovery, such as a sample or a discovery set." },
    ],
  },
  aesthetics: {
    key: "aesthetics", label: "Aesthetics clinic", short: "aesthetics clinic", accent: "#6a5646",
    keywords: /\b(aesthetic\w*|clinics?|skin(care)?|beauty|cosmetic\w*|facials?|salons?)\b/i,
    angles: [
      { stage: "Awareness", text: "Introduce the clinic and the people who run it." },
      { stage: "Trust", text: "Show qualifications and set honest expectations." },
      { stage: "Action", text: "Invite a personal consultation." },
    ],
  },
  beverage: {
    key: "beverage", label: "Soft drinks & beverages", short: "drinks brand", accent: "#182a4a",
    keywords: /\b(soft drinks?|drinks?|beverages?|soda|juice|cola|squash|fizzy)\b/i,
    angles: [
      { stage: "Awareness", text: "Introduce the drink and where it fits in someone's day." },
      { stage: "Trust", text: "Share what is in it, using only verified information." },
      { stage: "Action", text: "Point people to where they can buy it." },
    ],
  },
  charity: {
    key: "charity", label: "Charity & community", short: "charity", accent: "#8a2f45",
    keywords: /\b(charit\w*|non-?profit|foundations?|volunteer\w*|fundrais\w*|community (group|organi[sz]ation))\b/i,
    angles: [
      { stage: "Awareness", text: "Share the cause and the local need." },
      { stage: "Trust", text: "Show where support goes, using only outcomes you can evidence." },
      { stage: "Action", text: "Invite people to give time or to donate." },
    ],
  },
  takeaway: {
    key: "takeaway", label: "Independent takeaway", short: "takeaway", accent: "#6e3d12",
    keywords: /\b(takeaways?|take-?away|restaurants?|caf[eé]s?|food|kitchens?|pizza|catering)\b/i,
    angles: [
      { stage: "Awareness", text: "Show what you cook and when you are open." },
      { stage: "Trust", text: "Show real preparation and real people." },
      { stage: "Action", text: "Make ordering direct and easy." },
    ],
  },
  professional_services: {
    key: "professional_services", label: "Professional services", short: "professional services", accent: "#2f4858",
    keywords: /\b(accountants?|accountancy|chartered|bookkeep(ing|ers?)|tax|solicitors?|law firm|lawyers?|legal|consult(ing|ancy|ants?)|advis(ory|ers?|ors?)|architects?|surveyors?|recruit(ment|ers?)|financial planning|professional services)\b/i,
    angles: [
      { stage: "Awareness", text: "Explain who you help and which problems you solve, in plain language." },
      { stage: "Trust", text: "Show your expertise with useful explanations and answers to common questions, citing only credentials you can evidence." },
      { stage: "Action", text: "Invite an enquiry or an introductory conversation with a single clear next step." },
    ],
  },
};

// Whether the API accepts this sector today. "professional_services" only after the backend enum and constraint ship (see flag.js).
export const isSectorPersistable = (key, env) => (key === "professional_services" ? isProfessionalSectorPersisted(env) : Boolean(SECTORS[key]));

export const sectorOptions = (env) => [
  { value: "", label: "Work it out from what I have typed" },
  { value: "neutral", label: "Not specified" },
  ...SECTOR_ORDER.filter((key) => isSectorPersistable(key, env)).map((key) => ({ value: key, label: SECTORS[key].label })),
];

const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

// An explicit choice always wins. Otherwise each text the customer supplied is checked in order, and the first
// sector (in SECTOR_ORDER) that matches wins. Nothing matched means neutral: a sector is never guessed.
export function resolveSector({ choice = "", texts = [] } = {}) {
  const picked = clean(choice);
  if (picked && SECTORS[picked]) return { key: picked, source: "chosen" };
  for (const raw of texts) {
    const text = clean(raw);
    if (!text) continue;
    for (const key of SECTOR_ORDER) if (SECTORS[key].keywords.test(text)) return { key, source: "inferred" };
  }
  return { key: "neutral", source: "none" };
}

export const guidanceFor = (key) => (SECTORS[key] || SECTORS.neutral).angles;
export const signatureTerms = (key) => ({
  leasing: ["lease", "leasing", "vehicle"],
  perfume: ["fragrance", "perfume", "scent"],
  aesthetics: ["aesthetics", "clinic", "consultation"],
  beverage: ["drink", "drinks", "flavour"],
  charity: ["charity", "donate", "volunteer"],
  takeaway: ["takeaway", "cook", "ordering"],
  professional_services: ["advisory", "expertise"],
}[key] || []);
