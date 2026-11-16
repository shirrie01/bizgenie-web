# Bounded copy/CTA correction — dependent WEB source

Depends on API branch `bg-launch-copy-revisions`, new customer POST `/customer/campaigns/:campaignId/variants/:variantId/revisions`. No new billing/media/provider call. R1 source/release settings untouched.

The form edits existing title, body including CTA, caption and accessibility text. It snapshots campaign version/revision, derives deterministic retry keys, submits no asset/approval data, retains typed answers on rejection and disables stale-base save. Successful API result replaces current campaign and resets obsolete review/calendar views; existing backend command retains immutable history, revokes old approval and cancels its planned time. Published/read-only variants have no editing control. A role/scope change cannot apply an obsolete response to another workspace. No old revision browser/full editor is added.

Activation is intentionally fail-closed: `VITE_COPY_EDIT_API` AND a genuinely verified `copyRevisions` capability for the exact serving revision are required. API_COMPATIBILITY stays empty. bridge-v1 explicitly does not carry this route; it remains OFF there. No R1 bridge file, flag, manifest or infrastructure is changed. Future direct/bridge route integration needs separate approval and hosted acceptance. Do not point the UI at an unmerged/non-serving API or invent capability evidence.

The public-lead issue is documented separately as blocked on approved privacy/consent/retention, payload reconciliation with the existing durable paid-beta domain, and public-ingest authority; it is not silently remapped to paid-beta consent or enabled in this PR.

Local evidence: 60/60 focused editor/client/campaign/gate tests, 48/48 contract and quote regressions, final full suite 1591 PASS / 52 SKIP / 0 FAIL, Vite production build PASS. The initial parallel full run had four missing route-documentation registrations and one unrelated quote-test timeout; route records are now updated without changing the bridge allowlist, and the unchanged quote tests pass alone and in the final two-worker full run. Integration skips remain unexecuted; no hosted acceptance is claimed.
