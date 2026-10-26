// Reference-based creative planning (BG-STUDIO-022-FE). The customer DESCRIBES a style, concept or advertising pattern and gets an ORIGINAL brief
// for the existing creative-generation path (binding credit quote, CreativeStudio). There is no second generation workflow: this produces text for the
// existing brief box and nothing else.
//
// Honesty rules:
//   * What was analysed is stated exactly. A typed description is "description only"; BizGenie has NOT seen the ad. Image/video analysis of a customer
//     asset needs the media library (R4) and is unavailable, so a reference asset can be recorded by name only and is never described as analysed.
//   * The brief carries a no-copy instruction and the customer confirms they hold the rights to anything they reference.
//   * Competitor brand names, logos and slogans are held out of the generated brief.
export const ANALYSIS_LEVEL = { description_only: "Based only on your description. BizGenie has not seen the ad itself.", asset_named: "You named a file you own. It has not been analysed; media analysis is not available yet." };
export const HOOK_TYPES = ["question", "bold claim", "problem and solution", "story opening", "demonstration", "before and after", "social proof", "offer first"];
export const NARRATIVES = ["problem → solution → action", "story → lesson → action", "demonstration → benefit → action", "myth → truth → action", "offer → reason → action"];
const MAX = 1200;
const clean = (v, n = MAX) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

// Remove obviously third-party identifiers the customer typed so the brief does not carry them. Heuristic and shown to the customer: names that look
// like brands (@handles, #tags, ®/™ marks, "like <Capitalised Name>") are listed and replaced by a neutral phrase.
export function stripThirdPartyMarks(text) {
  const removed = [];
  let out = clean(text, 4000).replace(/[@#][A-Za-z0-9_.]{2,}/g, (m) => { removed.push(m); return "[reference removed]"; })
    .replace(/\b([A-Z][A-Za-z0-9&]+(?:\s+[A-Z][A-Za-z0-9&]+){0,2})\s*[®™]/g, (m, n) => { removed.push(n); return "[brand removed]"; });
  out = out.replace(/\b(?:like|similar to|copy|copying|in the style of|as seen (?:on|in))\s+([A-Z][A-Za-z0-9&]+(?:\s+[A-Z][A-Za-z0-9&]+){0,2})/g, (m, n) => { removed.push(n); return "in a similar spirit to [brand removed]"; });
  return { text: out, removed: [...new Set(removed)] };
}

export function buildReference(input) {
  const description = clean(input.description, 2000);
  if (description.length < 20) return { ok: false, message: "Describe the style or idea in a sentence or two." };
  if (!input.rightsConfirmed) return { ok: false, message: "Confirm you may use anything you reference as inspiration." };
  const sanitized = stripThirdPartyMarks(description);
  const asset = clean(input.assetName, 120);
  return {
    ok: true,
    reference: {
      description: sanitized.text, removed: sanitized.removed,
      hook: HOOK_TYPES.includes(input.hook) ? input.hook : "", narrative: NARRATIVES.includes(input.narrative) ? input.narrative : "",
      cta: clean(input.cta, 160), platform: clean(input.platform, 40), audience: clean(input.audience, 200),
      assetName: asset, analysis: asset ? "asset_named" : "description_only", rightsConfirmed: true,
    },
  };
}

// The brief text sent to the EXISTING generation box. Short, original, and explicit about what it must not do.
export function toBrief(ref, brandContext = {}) {
  const lines = [
    `Create an ORIGINAL ${ref.platform || "social"} concept inspired by this idea: ${ref.description}`,
    ref.hook ? `Hook style: ${ref.hook}.` : "", ref.narrative ? `Structure: ${ref.narrative}.` : "",
    ref.audience ? `Audience: ${ref.audience}.` : brandContext.audience ? `Audience: ${brandContext.audience}.` : "",
    ref.cta ? `Call to action: ${ref.cta}.` : brandContext.cta ? `Call to action: ${brandContext.cta}.` : "",
    "Do not copy any existing advertisement, brand name, logo, slogan, character or distinctive artwork. Use only claims the business has approved.",
  ].filter(Boolean);
  return lines.join(" ").slice(0, 4000);
}

// Three original directions for comparison, derived deterministically from the structured choices (not from the described ad).
// They are starting angles for the customer to pick from, not generated creative and not a prediction.
export function directions(ref, brandContext = {}) {
  const hooks = ref.hook ? [ref.hook] : ["question", "problem and solution", "demonstration"];
  return hooks.slice(0, 3).map((h, i) => ({
    key: `d${i + 1}`, label: `Direction ${String.fromCharCode(65 + i)}: ${h}`, hook: h, narrative: ref.narrative || NARRATIVES[i % NARRATIVES.length],
    suitability: ref.platform ? `Written for ${ref.platform}.` : "Choose a platform to tailor this.",
    audience: ref.audience || brandContext.audience || "Not specified yet",
    brief: toBrief({ ...ref, hook: h, narrative: ref.narrative || NARRATIVES[i % NARRATIVES.length] }, brandContext),
  }));
}
