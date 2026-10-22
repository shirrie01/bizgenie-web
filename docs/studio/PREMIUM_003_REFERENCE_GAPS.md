# BG-STUDIO-PREMIUM-003 — six-stage fidelity gaps vs the founder reference

Compared: `studio-preview/v3/index.html` at the head of the premium-002 onboarding branch (all six stages rendered at 1440/768/390/320) against the founder six-screen mockup supplied in chat (not a repository file; no Figma access in this session). The mockup is directional, not an asset source. "Blocked" means no honest implementation exists without a backend or rights-cleared assets; it is not a design omission.

## Shell (all stages)
| Reference | Here | Gap | Type |
|---|---|---|---|
| Standalone full-width onboarding, no workspace rail | V3 workspace rail (Onboarding / Mission Control / Studio / Calendar) around onboarding | Rail is the locked V3 shell; reference shows none during onboarding | Founder decision |
| "n / 6 · Stage name" header, thin progress | Segmented, labelled, keyboard progress + "0n / 06" overline | Closer to a stepper than the reference's single line; acceptable | Design |
| "Save and exit" / "Skip for now" per stage | Absent on purpose | Needs tenant-scoped draft persistence (`SAVE_AND_EXIT_GAP.md`) | Blocked (API) |

## Stage by stage
| # | Reference | Here | Precise gaps | Blocked by |
|---|---|---|---|---|
| 1 Welcome | "Your marketing engine, ready to work."; 4-tick promise list; "Let's get started"; "Trusted by small businesses" strip; photographic post collage with engagement counts and handwritten note | V3 headline kept (locked); 4-tick promise list; original illustrative tiles; CTA "Continue" | No photographic collage; no social proof (unverifiable claims are not shown); CTA copy differs; headline differs (V3 locked) | Rights-cleared imagery; founder copy decision |
| 2 Your Business | URL field + "Or enter manually"; "We found this about your business" card (logo, tagline, product thumbnails, industry, location, products, tone); "We use your website…" panel | Manual form with live "Your input · not verified" profile; import button disabled; planned-items list | No import, no discovered-business card, no logo/thumbnails, no inline "Or enter manually" toggle | Website-import API |
| 3 Your Goals | Six photo cards (incl. "Increase online sales", "Support a specific promotion", "Not sure yet" with "Explore inspiration") | Five original-icon cards incl. "Not sure yet" | No photography; goals "Increase online sales" and "Support a specific promotion" absent (copy/product decision); no "Explore inspiration" action | Imagery; product decision |
| 4 Brand Setup | Logo + Edit; 5 colour swatches; voice select; key-message chips; large "Visual inspiration" image + thumbnails | Logo upload disabled; user-entered colours (≤5), voice select, key messages | No uploaded/imported logo, no pre-filled swatches (would be invented), no visual-inspiration panel | Upload/import APIs; imagery |
| 5 Channels | Row per channel with content types ("Posts, Reels, Stories"), live Connect buttons, thumbnails; "safe and optional" lock note | Card per channel with fit line, selected/not-selected and "Not connected", disabled "Connect: coming soon", permission note | No per-channel content-type line (easy copy follow-up), no thumbnails, no working Connect | OAuth/connection API; imagery |
| 6 Proposal | Creative hero with product art, "Summer Launch 2024"; Goal/Audience/Channels/Content "12 assets"/Timeline "4 weeks"; 4-step rail; "Approve and generate" | Creative-led neutral hero (original art) with labelled demo styles; honest brief with status chips; 4-step rail; "Approve brief and explore workspace" | No real creative (never fabricated); no asset count or timeline (would be invented); CTA does not generate (concept only) | Generation + proposal API; founder approval of CTA wording |

## Recommended next design slices (no backend needed)
1. Per-channel content-type line and "safe and optional" lock treatment (copy only).
2. Welcome promise-row polish and CTA copy once the founder confirms wording.
3. Goal-card copy for "Increase online sales" / "Support a specific promotion" once approved.
Everything marked Blocked needs a decision or API first.
