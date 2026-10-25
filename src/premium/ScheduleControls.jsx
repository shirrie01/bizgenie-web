import React, { useState } from "react";
import { activeSchedule, describeSchedule, scheduleFromLocal } from "./scheduleModel";

// Record when approved content is planned to go out (BG-STUDIO-018-FE). Premium Studio only. It records a plan; it publishes nothing.
export default function ScheduleControls({ campaign, variant, state, onSchedule, now = new Date() }) {
  const scheduled = variant.workflow === "scheduled";
  const current = scheduled ? activeSchedule(campaign, variant) : null;
  const tz = (current && current.timezone) || campaign.display_timezone || "";
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState("");
  const busy = state.status === "saving" && state.variantId === variant.variant_id;
  const mine = state.variantId === variant.variant_id;
  const id = `schedule-${variant.variant_id}`;

  function submit() {
    const made = scheduleFromLocal(value, tz, now);
    if (!made.ok) { setProblem(made.error); return; }
    setProblem("");
    onSchedule(variant, made.payload, scheduled ? "reschedule" : "schedule");
  }

  return (
    <div className="ps-schedule">
      {scheduled && <p role="status"><strong>Scheduled for {current ? describeSchedule(current) : "a time that could not be read"}.</strong> BizGenie does not publish for you: at that time you publish and then confirm it here.</p>}
      <label htmlFor={id}>{scheduled ? "Change the planned time" : "Plan when to publish"}{tz ? ` (${tz})` : ""}</label>
      <input id={id} type="datetime-local" value={value} onChange={(e) => { setValue(e.target.value); setProblem(""); }} aria-describedby={`${id}-hint`} aria-invalid={problem ? "true" : undefined} disabled={busy || !tz} />
      <p className="ps-hint" id={`${id}-hint`}>This records the time you plan to publish. It does not post anything or remind you.{!tz ? " This campaign has no time zone, so a time cannot be scheduled." : ""}</p>
      {problem && <p className="error" role="alert">{problem}</p>}
      {mine && state.status === "error" && <p className="error" role="alert">{state.error}</p>}
      {mine && state.status === "saved" && <p role="status">Planned time saved.</p>}
      <button className="secondary" type="button" onClick={submit} disabled={busy || !tz || !value}>{busy ? "Saving…" : scheduled ? "Change planned time" : "Save planned time"}</button>
    </div>
  );
}
