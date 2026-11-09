import { fetchPublishingCalendar } from "./socialClient";

// Delivery overlay for the workspace calendar (BG-STUDIO-026-FE, DEC-025; bizgenie-api #220 BG_STUDIO_025_BACKEND_HANDOFF.md F3).
// The workspace calendar (GET /customer/calendar) is the single source of WHAT is scheduled or published and already folds a verified platform publication into
// `occurrence_kind: "published"` (replacing, never adding to, the schedule). GET /customer/social/calendar adds HOW a still-scheduled item is being delivered
// (queued / publishing / uncertain / failed / cancelled). The two are joined by campaign + variant + the exact planned instant, and ONLY onto items that are still
// "scheduled": a published item never gets a second entry or a second claim, and an overlay row with no matching schedule is dropped and counted, not drawn.
export const DELIVERY_LABEL = {
  queued: "Queued to send at the planned time",
  publishing: "Being sent now",
  uncertain: "Sent, but the outcome is not confirmed yet. It will not be sent again until checked",
  failed: "The platform refused it; nothing was published",
  cancelled: "Sending was cancelled; it will not be published automatically",
};
const same = (a, b) => Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

export function applyDeliveryOverlay(items, dispatches) {
  const used = new Set(); let dropped = 0;
  const out = items.map((item) => {
    if (item.occurrenceKind !== "scheduled" || !item.occurrenceAt) return item;
    const d = dispatches.find((x) => !used.has(x.id) && x.campaignId === item.campaignId && x.variantId === item.variantId && same(x.scheduledFor, item.occurrenceAt) && DELIVERY_LABEL[x.deliveryState]);
    if (!d) return item;
    used.add(d.id); return { ...item, delivery: { state: d.deliveryState, label: DELIVERY_LABEL[d.deliveryState], dispatchId: d.id } };
  });
  for (const d of dispatches) if (!used.has(d.id) && d.deliveryState !== "published") dropped += 1;
  return { items: out, dropped };
}

// Every page of the overlay for the window (bounded). Failure never hides the calendar: the caller keeps the plain items and says delivery could not be loaded.
export async function fetchDeliveryOverlay({ apiBaseUrl, accessToken, scope, from, to, fetchImpl, maxPages = 10 }) {
  const entries = []; let cursor; let pages = 0; let skipped = 0;
  do {
    const r = await fetchPublishingCalendar({ apiBaseUrl, accessToken, scope, from, to, cursor, ...(fetchImpl ? { fetchImpl } : {}) });
    entries.push(...r.entries); skipped += r.skipped; cursor = r.nextCursor || undefined; pages += 1;
  } while (cursor && pages < maxPages);
  if (cursor) throw new Error("The delivery status has more pages than can be loaded at once.");
  return { entries, skipped };
}
