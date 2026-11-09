// Things the customer's browser was told in an answer and the server does NOT repeat when the campaign is read again (BG-STUDIO-020-FE).
// Found by running this app's adapters against the real backend draft routes: the customer campaign detail (`safeCampaign` in
// src/campaigns/router.js) omits `active_schedule_id`, `schedules`, `pending_attempt_id`, `publication_id` and `publications`, but the commands that
// create them DO return their ids (`result.created_ids.schedule_ids[0]`, `attempt_ids[0]`). The browser keeps those ids as a CONVENIENCE so a reload
// does not lose the plan to remove a planned time or to answer a waiting manual-publication handoff. They are never authority: the server re-checks every
// id (a stale one is refused with a conflict or not-found, which the page explains), and the proper fix is for the detail to include them (handoff row).
const key = (scope, kind, campaignId, variantId) => `bg:facts:${scope.tenantId}:${scope.projectId}:${kind}:${campaignId}:${variantId}`;
const guard = (fn) => { try { return fn(); } catch { return null; } };
export const remember = (scope, kind, campaignId, variantId, value) => guard(() => { window.localStorage.setItem(key(scope, kind, campaignId, variantId), JSON.stringify(value)); return true; });
export const recall = (scope, kind, campaignId, variantId) => guard(() => { const raw = window.localStorage.getItem(key(scope, kind, campaignId, variantId)); return raw ? JSON.parse(raw) : null; });
export const forget = (scope, kind, campaignId, variantId) => guard(() => { window.localStorage.removeItem(key(scope, kind, campaignId, variantId)); return true; });
