# BizGenie launch-surface foundation

Base API authority: BizGenie API main 0fe6d2f6357657cf317cd979917b0a1dd4bbc230.

This foundation implements goal-first entry, a plain-language recommendation response, suggested content items with reasons, an explicit review-first state, and a bounded campaign handoff placeholder.

The surface calls POST /customer/campaign-recommendations and does not create a campaign, publish content, connect social accounts, charge credits, or expose provider details.

The current demo IDs are environment placeholders. Authenticated token/session wiring and the deferred-account-creation flow are the next implementation slice and must be added before customer use. No production deployment is implied by this repository.
