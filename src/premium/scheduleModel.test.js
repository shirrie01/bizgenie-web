// @vitest-environment node
import { describe, expect, it } from "vitest";
import { activeSchedule, describeSchedule, isTimeZone, scheduleFromLocal, zoneOffsetMinutes } from "./scheduleModel";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const ok = (local, tz, now = NOW) => { const r = scheduleFromLocal(local, tz, now); expect(r.ok, JSON.stringify(r)).toBe(true); return r.payload; };

describe("scheduleFromLocal: the request fields the backend validates", () => {
  it("London in summer (UTC+1) and winter (UTC+0)", () => {
    expect(ok("2026-07-01T09:30", "Europe/London", new Date("2026-06-01T00:00:00Z"))).toEqual({ scheduled_for: "2026-07-01T08:30:00.000Z", timezone: "Europe/London", local_datetime: "2026-07-01T09:30:00.000", utc_offset_minutes: 60 });
    expect(ok("2026-11-10T09:30", "Europe/London")).toEqual({ scheduled_for: "2026-11-10T09:30:00.000Z", timezone: "Europe/London", local_datetime: "2026-11-10T09:30:00.000", utc_offset_minutes: 0 });
  });
  it("zones ahead of and behind UTC, including a half-hour offset", () => {
    expect(ok("2026-11-10T09:00", "Asia/Tokyo")).toMatchObject({ scheduled_for: "2026-11-10T00:00:00.000Z", utc_offset_minutes: 540 });
    expect(ok("2026-11-10T09:00", "America/New_York")).toMatchObject({ scheduled_for: "2026-11-10T14:00:00.000Z", utc_offset_minutes: -300 });
    expect(ok("2026-11-10T09:00", "Asia/Kolkata")).toMatchObject({ scheduled_for: "2026-11-10T03:30:00.000Z", utc_offset_minutes: 330 });
  });
  it("uses the offset in force AT the chosen time, across a clock change", () => {
    // Clocks go back in London on 25 Oct 2026 at 02:00 BST. 24 Oct is BST (+60); 26 Oct is GMT (0).
    expect(ok("2026-10-24T12:00", "Europe/London", new Date("2026-10-01T00:00:00Z")).utc_offset_minutes).toBe(60);
    expect(ok("2026-10-26T12:00", "Europe/London", new Date("2026-10-25T12:00:00Z")).utc_offset_minutes).toBe(0);
  });
  it("refuses a wall time that does not exist (spring forward) in plain words", () => {
    const r = scheduleFromLocal("2027-03-28T01:30", "Europe/London", NOW);
    expect(r.ok).toBe(false); expect(r.error).toMatch(/does not exist in Europe\/London because the clocks change/i);
  });
  it("refuses the past, the present, malformed input and an unknown zone", () => {
    expect(scheduleFromLocal("2026-10-25T11:59", "UTC", NOW)).toEqual({ ok: false, error: "Choose a time in the future." });
    expect(scheduleFromLocal("2026-10-25T12:00", "UTC", NOW).ok).toBe(false);
    expect(scheduleFromLocal("", "UTC", NOW).error).toMatch(/choose a date and a time/i);
    expect(scheduleFromLocal("2026-13-40T99:99", "UTC", NOW).ok).toBe(false);
    expect(scheduleFromLocal("2026-11-10T09:00", "Mars/Olympus", NOW).error).toMatch(/not recognised/i);
  });
  it("satisfies the backend's own check: local_datetime is scheduled_for shifted by the offset, with milliseconds", () => {
    for (const [local, tz] of [["2026-11-10T09:30", "Europe/London"], ["2026-12-01T00:00", "Pacific/Auckland"], ["2027-06-15T23:59", "America/Los_Angeles"]]) {
      const p = ok(local, tz);
      expect(new Date(new Date(p.scheduled_for).getTime() + p.utc_offset_minutes * 60000).toISOString().slice(0, 23)).toBe(p.local_datetime);
      expect(p.local_datetime).toBe(`${local}:00.000`);
      expect(zoneOffsetMinutes(new Date(p.scheduled_for), tz)).toBe(p.utc_offset_minutes);
    }
  });
});

describe("reading a schedule back", () => {
  const campaign = { schedules: [{ schedule_id: "s1", scheduled_for: "2026-11-10T09:30:00.000Z", timezone: "Europe/London" }, { schedule_id: "s2", scheduled_for: "2026-12-01T08:00:00.000Z", timezone: "Asia/Tokyo" }] };
  it("finds the variant's ACTIVE schedule only, and words it with its zone", () => {
    expect(activeSchedule(campaign, { active_schedule_id: "s2" }).schedule_id).toBe("s2");
    expect(activeSchedule(campaign, { active_schedule_id: null })).toBeNull();
    expect(activeSchedule({}, { active_schedule_id: "s1" })).toBeNull();
    expect(describeSchedule(campaign.schedules[1])).toBe("Tuesday, 1 December 2026 at 17:00 (Asia/Tokyo)");
    expect(describeSchedule(null)).toBe("");
    expect(isTimeZone("Europe/London")).toBe(true); expect(isTimeZone("nope")).toBe(false);
  });
});
