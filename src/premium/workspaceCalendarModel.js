// Pure model for the workspace-wide calendar (BG-STUDIO-018-FE). No DOM, network or storage.
//
// Data honesty: every item comes from a real campaign document and that campaign's calendar entries (see
// workspaceCalendarClient.js). A variant with no schedule or publication has no date and is listed as "not yet scheduled";
// it is never placed on a day. Times are shown in ONE stated time zone (the viewer's browser unless told otherwise).

export const VIEWS = ["month", "week", "day"];

const pad = (n) => String(n).padStart(2, "0");
const keyOfUtc = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const dateOfKey = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (key, n) => { const d = dateOfKey(key); d.setUTCDate(d.getUTCDate() + n); return keyOfUtc(d); };
export const addMonths = (key, n) => { const d = dateOfKey(key); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return keyOfUtc(d); };
export const monthStart = (key) => `${key.slice(0, 7)}-01`;
const weekdayMon0 = (key) => (dateOfKey(key).getUTCDay() + 6) % 7; // Monday = 0

export function viewerTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

// The calendar day an instant falls on in `tz` ("YYYY-MM-DD").
export function dayKey(iso, tz = "UTC") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const todayKey = (now = new Date(), tz = "UTC") => dayKey(now.toISOString(), tz);
export function timeLabel(iso, tz = "UTC") {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
export function dayLabel(key, long = true) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: long ? "long" : "short", day: "numeric", month: "long", year: "numeric" }).format(dateOfKey(key));
}
export const dowShort = (key) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(dateOfKey(key));
export const monthLabel = (key) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(dateOfKey(key));

// Day keys shown for a view. Month: whole weeks (Monday first) covering the month.
export function rangeFor(view, anchor) {
  if (view === "day") return [anchor];
  if (view === "week") { const start = addDays(anchor, -weekdayMon0(anchor)); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
  const first = monthStart(anchor); const start = addDays(first, -weekdayMon0(first));
  const last = addDays(addMonths(first, 1), -1); const end = addDays(last, 6 - weekdayMon0(last));
  const days = []; for (let k = start; k <= end; k = addDays(k, 1)) days.push(k);
  return days;
}
export const stepAnchor = (view, anchor, dir) => (view === "day" ? addDays(anchor, dir) : view === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir));
export function rangeTitle(view, anchor) {
  if (view === "day") return dayLabel(anchor);
  if (view === "month") return monthLabel(anchor);
  const days = rangeFor("week", anchor);
  return `Week of ${dayLabel(days[0], false)} to ${dayLabel(days[6], false)}`;
}

// The explicit period to request for an anchor day: the visible month, one week either side. `from` inclusive, `to` exclusive
// (the backend's semantics), as UTC instants.
export function windowFor(anchor) {
  const first = monthStart(anchor);
  const from = dateOfKey(addDays(first, -7));
  const to = dateOfKey(addDays(addMonths(first, 1), 8));
  return { from: from.toISOString(), to: to.toISOString() };
}
export const windowCovers = (win, days) => Boolean(win) && days.length > 0 && dateOfKey(days[0]).getTime() >= Date.parse(win.from) && dateOfKey(days[days.length - 1]).getTime() < Date.parse(win.to);
export function windowText(win, tz = "UTC") {
  if (!win) return "";
  const f = dayKey(win.from, tz); const t = dayKey(new Date(Date.parse(win.to) - 1).toISOString(), tz);
  return `${dayLabel(f, false)} to ${dayLabel(t, false)}`;
}

// ---- statuses (the backend's workflow values; nothing is invented) ----
const STATUS = {
  draft: { label: "Draft", order: 0 }, review: { label: "In review", order: 1 }, approved: { label: "Approved, not scheduled", order: 2 },
  scheduled: { label: "Scheduled", order: 3 }, published: { label: "Published", order: 4 },
};
export const statusLabel = (workflow) => (STATUS[workflow] ? STATUS[workflow].label : workflow ? String(workflow).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Unknown");
export const statusOptions = (items) => [...new Set(items.map((i) => i.workflow).filter(Boolean))].sort((a, b) => (STATUS[a]?.order ?? 9) - (STATUS[b]?.order ?? 9)).map((value) => ({ value, label: statusLabel(value) }));
export const platformLabel = (item) => [item.destinationLabel || item.platform, item.placement && item.placement !== item.destinationLabel ? item.placement : ""].filter(Boolean).join(" · ") || "Channel not stated";

export function filterItems(items, { campaignId = "", platform = "", status = "" } = {}) {
  return items.filter((i) => (!campaignId || i.campaignId === campaignId) && (!platform || (i.platform || i.destinationLabel) === platform) && (!status || i.workflow === status));
}
export const platformOptions = (items) => [...new Set(items.map((i) => i.platform || i.destinationLabel).filter(Boolean))].sort();

// Dated items grouped by day in `tz`, ordered by time then variant id.
export function groupByDay(items, tz = "UTC") {
  const map = new Map();
  for (const item of items.filter((i) => i.occurrenceAt)) {
    const key = dayKey(item.occurrenceAt, tz); if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  for (const list of map.values()) list.sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt) || a.variantId.localeCompare(b.variantId));
  return map;
}
export const undated = (items) => items.filter((i) => !i.occurrenceAt);

// Two or more SCHEDULED items for the same destination at the same minute. Computed from the data in hand only.
export function findClashes(items) {
  const groups = new Map();
  for (const i of items) {
    if (i.workflow !== "scheduled" || !i.occurrenceAt) continue;
    const key = `${i.platform}|${i.placement}|${i.destinationLabel}|${new Date(i.occurrenceAt).toISOString().slice(0, 16)}`;
    groups.set(key, [...(groups.get(key) || []), i.key]);
  }
  const clashing = new Set();
  for (const keys of groups.values()) if (keys.length > 1) keys.forEach((k) => clashing.add(k));
  return clashing;
}
