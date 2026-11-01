import React, { useState } from "react";
import { enqueueDispatch as realEnqueue } from "./socialClient";
import { activeSchedule } from "./scheduleModel";

// Send an approved, scheduled TikTok video to the creator's TikTok inbox as a DRAFT (BG-LAUNCH-006). BizGenie uploads the video at the planned time; the creator opens TikTok,
// reviews it and posts it themselves. Nothing here publishes anything, and the screen says so before and after. Owner only, TikTok only, and only for an item that was created
// for a connected account (its destination key is that connection's id; the server refuses anything else).
const MESSAGES = {
  DESTINATION_NOT_APPROVED: "This item was not created for a connected TikTok account, so it cannot be sent. Add it again and choose the connected account.",
  CONNECTION_UNAVAILABLE: "The TikTok connection needs attention. Reconnect it, then try again.",
  PUBLICATION_AUTHORITY_STALE: "This item changed since it was approved. Review and approve it again first.",
  VERSION_CONFLICT: "The campaign changed. Reload it and try again.",
};

export default function SendDraftToTikTok({ campaign, variant, session, scope, isOwner, apiBaseUrl, api = {} }) {
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState({ status: "idle", error: "", dispatch: null });
  if (!isOwner || variant.platform !== "tiktok" || variant.workflow !== "scheduled" || !variant.destination_key) return null;
  const schedule = activeSchedule(campaign, variant);
  if (!schedule || !schedule.schedule_id) return null;
  const done = state.status === "done";
  async function send() {
    if (!confirmed || state.status === "sending") return;
    setState({ status: "sending", error: "", dispatch: null });
    try {
      const d = await (api.enqueueDispatch || realEnqueue)({ apiBaseUrl, accessToken: session.accessToken, scope, connectionId: variant.destination_key, campaignId: campaign.campaign_id, variantId: variant.variant_id, scheduleId: schedule.schedule_id, expectedCampaignVersion: campaign.version });
      setState({ status: "done", error: "", dispatch: d });
    } catch (error) {
      const unconfirmed = error && error.kind === "unconfirmed";
      setState({ status: "error", error: unconfirmed ? "BizGenie could not confirm whether this was queued. Check the publishing list before trying again." : (MESSAGES[error && error.code] || (error && error.message) || "That could not be queued yet. Nothing was uploaded."), dispatch: null });
    }
  }
  return (
    <div className="ps-draft" role="group" aria-label="Send to TikTok as a draft">
      <p><strong>Send to TikTok as a draft</strong></p>
      <p className="ps-hint">At the planned time BizGenie uploads this video to your TikTok inbox as a draft. You then open TikTok to review it and post it yourself. BizGenie does not publish it.</p>
      {!done && <label className="ps-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={state.status === "sending"} /> I understand this puts a draft in my TikTok inbox and that I still have to post it myself.</label>}
      {state.status === "error" && <p className="error" role="alert">{state.error}</p>}
      {done && <p role="status">Queued. BizGenie will upload the draft at the planned time. Its progress is shown under Connections; it will say “Draft sent to TikTok”, never “Published”.</p>}
      {!done && <button className="secondary" type="button" onClick={send} disabled={!confirmed || state.status === "sending"}>{state.status === "sending" ? "Queuing…" : "Send as a draft at the planned time"}</button>}
    </div>
  );
}
