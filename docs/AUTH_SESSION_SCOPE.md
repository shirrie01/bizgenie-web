# Frontend authentication boundary

The goal-first screen remains usable before account creation, but recommendation requests are blocked until a complete authenticated customer session is configured.

Required runtime values are VITE_BIZGENIE_ACCESS_TOKEN, VITE_BIZGENIE_TENANT_ID, VITE_BIZGENIE_PROJECT_ID and VITE_BIZGENIE_BRAND_ID. The frontend sends the access token as a Bearer token and sends scope identifiers only from the configured session, never from user-editable form fields.

If no session exists, the goal remains on screen and the user is offered a deferred account-creation handoff. No campaign is created and no API request is made in that state.

This slice does not implement identity provider screens, token issuance, persistence of account records, billing, publishing or deployment. Those require an authenticated application integration contract.
