// Scheduling an approved variant (BG-STUDIO-018-FE). Contract: bizgenie-api src/campaigns/router.js `scheduleBody` and repository `validSchedule`:
//   { scheduled_for (instant, in the future), timezone (IANA), local_datetime ("YYYY-MM-DDTHH:mm:ss.SSS", the wall time in that zone),
//     utc_offset_minutes (the zone's offset AT that instant) }.
// A schedule only RECORDS when the customer plans to publish. BizGenie does not publish; the customer publishes and confirms by hand.

const FMT = (timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export const isTimeZone = (tz) => { try { FMT(tz); return true; } catch { return false; } };

// Minutes the zone is ahead of UTC at an instant.
export function zoneOffsetMinutes(instant, tz) {
  const parts = FMT(tz).formatToParts(instant);
  const n = (type) => Number(parts.find((p) => p.type === type).value);
  const wall = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((wall - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

// Turns a datetime-local value ("YYYY-MM-DDTHH:mm") in `timeZone` into the request fields, or says in plain words why not.
export function scheduleFromLocal(localDateTime, timeZone, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(localDateTime || ""));
  if (!m) return { ok: false, error: "Choose a date and a time." };
  if (!isTimeZone(timeZone)) return { ok: false, error: "This campaign's time zone is not recognised, so a time cannot be scheduled safely." };
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi) return { ok: false, error: "That date or time is not valid." };
  let instant = new Date(wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60000);
  instant = new Date(wall - zoneOffsetMinutes(instant, timeZone) * 60000);
  const offset = zoneOffsetMinutes(instant, timeZone);
  if (instant.getTime() + offset * 60000 !== wall) return { ok: false, error: `That time does not exist in ${timeZone} because the clocks change then. Choose a different time.` };
  if (instant.getTime() <= now.getTime()) return { ok: false, error: "Choose a time in the future." };
  return { ok: true, payload: { scheduled_for: instant.toISOString(), timezone: timeZone, local_datetime: new Date(instant.getTime() + offset * 60000).toISOString().slice(0, 23), utc_offset_minutes: offset } };
}

// The variant's current schedule record from the campaign document, if any.
export function activeSchedule(campaign, variant) {
  if (!campaign || !variant || !variant.active_schedule_id || !Array.isArray(campaign.schedules)) return null;
  return campaign.schedules.find((s) => s.schedule_id === variant.active_schedule_id) || null;
}

export function describeSchedule(schedule) {
  if (!schedule || !schedule.scheduled_for) return "";
  const tz = isTimeZone(schedule.timezone) ? schedule.timezone : "UTC";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(schedule.scheduled_for))} (${tz})`;
}
