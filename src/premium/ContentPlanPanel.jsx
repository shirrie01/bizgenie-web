import React, { useState } from "react";
import { creditNeeds } from "./contentPlanClient";

// Launch-week plan (BG-FOUNDER-E2E-FINAL-01): turns the saved campaign + Brand Brain into a seven-day set of content items. The plan is a
// deterministic TEMPLATE, not generated content and not a performance claim. Adding items creates drafts only; every image or video still needs its
// own price and your explicit confirmation, and nothing is approved, scheduled or published until you do it.
const PLATFORM = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", email: "Email" };
const CLASS_LABEL = { "image.normal": "image", "video.normal": "video", "text.standard": "text" };
const when = (s) => (s && s.scheduled_for ? new Date(s.scheduled_for).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: s.timezone }) : "Asset library (not scheduled)");
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); };

export default function ContentPlanPanel({ state, onLoad, onAdd, busy = false }) {
  const [start, setStart] = useState(tomorrow());
  const plan = state && state.plan;
  const needs = plan ? creditNeeds(plan) : {};
  const present = new Set(((state && state.existingNames) || []));
  const remaining = plan ? plan.items.filter((i) => !present.has(i.content_item.name)).length : 0;
  return (
    <details className="ps-creative ps-plan">
      <summary>Plan a launch week for this campaign</summary>
      <div className="ps-plan-body">
        <p className="ps-lede">Get a seven-day plan built from your Brand Brain: posts, images and videos for the channels BizGenie can preview, each with a call to action and a suggested time. It is a draft template. Nothing is created, generated, priced or scheduled until you choose to.</p>
        <label htmlFor="cpp-start">First day of the week</label>
        <input id="cpp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <button type="button" className="secondary" disabled={busy || !start} onClick={() => onLoad(start)}>{state && state.status === "loading" ? "Building your plan…" : plan ? "Rebuild plan" : "Build my plan"}</button>
        <div role="status" aria-live="polite" className="ps-plan-live">{state && state.status === "adding" ? `Adding item ${state.progress ? state.progress.done : 0} of ${plan ? plan.items.length : 0}…` : state && state.status === "added" ? state.message : ""}</div>
        {state && state.error && <p className="error" role="alert">{state.error}</p>}
        {plan && (
          <>
            <h3>{plan.strategy.summary}</h3>
            <ul>{plan.strategy.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
            <p><strong>{plan.totals.posts} posts</strong> · {plan.totals.images} images · {plan.totals.videos} videos. Credits needed, by kind: {Object.keys(needs).length ? Object.entries(needs).map(([k, n]) => `${n} × ${CLASS_LABEL[k] || k}`).join(", ") : "none"}. Your exact price for each item is shown before you confirm it.</p>
            <table className="ps-plan-table">
              <caption>Seven-day plan ({plan.display_timezone})</caption>
              <thead><tr><th scope="col">When</th><th scope="col">Item</th><th scope="col">Channel</th><th scope="col">Call to action</th></tr></thead>
              <tbody>{plan.items.map((i) => (
                <tr key={i.plan_item}>
                  <td data-label="When">{when(i.schedule)}</td>
                  <td data-label="Item">{i.content_item.name}{present.has(i.content_item.name) && <em> · added</em>}</td>
                  <td data-label="Channel">{PLATFORM[i.content_item.platform] || i.content_item.platform} {i.content_item.format}</td>
                  <td data-label="Call to action">{i.cta.label}{i.cta.source !== "brand_brain" && <small> (default, please confirm)</small>}</td>
                </tr>))}</tbody>
            </table>
            {plan.assumptions_to_confirm.length > 0 && <><h4>Please confirm before publishing</h4><ul>{plan.assumptions_to_confirm.map((a) => <li key={a}>{a}</li>)}</ul></>}
            {plan.placeholders.length > 0 && <p className="ps-plan-note"><strong>Placeholders:</strong> {plan.placeholders.join(" ")}</p>}
            <button type="button" className="ps-primary" disabled={busy || remaining === 0} onClick={() => onAdd(plan)}>{remaining === 0 ? "All plan items are in this campaign" : state.status === "adding" ? "Adding…" : state.failed ? `Continue adding ${remaining} items` : `Add ${remaining} items to this campaign as drafts`}</button>
          </>
        )}
      </div>
    </details>
  );
}
