# R2 dependent WEB source — root campaign only

API companion bg-r2-03-founder-campaign supplies default-OFF founder pin/admission and separate profile. This WEB change is independent of BG-GJ-02 (which has no WEB leg). No deployment or flag/capability entry is enabled.

VITE_FOUNDER_CAMPAIGN_ROOT_API requires genuinely verified founderCampaignRoot capability for the exact serving revision. Existing compatibility manifest remains unchanged/empty. In R2 mode Create campaign posts exactly seven fields to existing /customer/campaigns using fixed bg-r2-founder-campaign-v1 key independent of recommendation ID. It never adds suggested content items, and success wording explicitly states that no suggested content was added/generated/scheduled/published. Normal non-R2 flow remains unchanged.

Lost/5xx/invalid response retains the original in-memory intent, performs scoped GET discovery without claiming matching listed objects prove command receipt, and waits for explicit retry. Exact body/key is replayed; changed unconfirmed intent is refused. Returned campaign scope must match the session; late result after scope change is ignored. No automatic POST resubmission, key rotation, paid call, new account or secrets.

Tests cover fixed body/key, root-only/no item POST, ambiguous GET then explicit replay, changed intent/foreign scope/409 denial and full App root-only integration plus existing ordinary workflow regressions. No public/customer acceptance is inferred from local tests. Independent Claude/API contract review required before future integration. Public NO-GO.

Local: focused57/57 PASS; full1595 PASS,52 SKIP,0 FAIL; production build PASS. No hosted acceptance claimed.
