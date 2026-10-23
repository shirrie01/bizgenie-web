> **Status update (BG-STUDIO-010-FE):** in the **production Premium Studio** (default-off flag) Save progress, Save and exit and resume are implemented against the `workspace-onboarding.v1` contract in bizgenie-api **draft PR #213** (head `d0e1142`). That backend is **not merged, its migration has not been applied anywhere, and nothing here has been run against a real API**: the frontend evidence is mocked. The **V3 preview** described below is unchanged and still has no Save and exit, for the reasons given. See `BG_STUDIO_010_FE_REPORT.md`.

# Onboarding "Save and exit" — gap (not implemented, not simulated)

The founder reference shows **Save and exit** (and **Skip for now**) on onboarding screens. The V3 preview deliberately has no such control: it makes no network calls and has no storage, so any "saved" confirmation would be false.

## What it needs before it can exist
1. **Authorised, tenant-scoped persistence** of onboarding progress: draft business profile, goal, brand setup, channel *selections* (not connections), current step. Scope must come from the authenticated session's `app_metadata` (tenant/project/brand), never from form fields (see `docs/SUPABASE_AUTH_CONTRACT.md`).
2. **A backend contract** in bizgenie-api (none exists today): a versioned draft-onboarding resource with read/update, idempotency keys and optimistic concurrency, consistent with the campaign command pattern. Needs founder approval before any API work.
3. **Truthful UI states**: saving / saved at (time) / failed with retry / signed-out. No optimistic "saved" without a server acknowledgement.
4. **Data rules**: what may be stored before a workspace exists, retention/deletion, and that unverified website data stays labelled as unverified.

## Until then
Preview shows no Save-and-exit control. Do not add browser storage as a stand-in; it would imply durability the product does not have.
