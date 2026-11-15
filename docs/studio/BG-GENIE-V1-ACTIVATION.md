# BG-GENIE-V1-ACTIVATION (API Issue #154)

## What was found
The conversational Genie of Issue #154 was never implemented. What exists is the six-panel wizard (WEB #86, #87). This change adds a **bounded, deterministic Genie guide** on top of that wizard. It does not replace the wizard, and the wizard is fully usable without it.

## What it is
`src/premium/genieGuide.js` is a pure function from what is on screen and saved (stage, draft, sector, channels, onboarding record, Brand Brain state) to a short message and an optional follow-up. `PremiumOnboarding.jsx` renders it as an `aside` labelled "Genie guide · prepared guidance, not a live AI assistant" under each panel heading.

- Welcome: introduces itself; for a returning customer states the genuine saved panel ("Your last saved setup was at Channels").
- Business: asks the open question ("What do you sell, and who do you want to reach?") and says the website is not read.
- What you do: asks for confirmation before an inferred sector becomes the customer's answer.
- Goals: reflects the chosen objective.
- Brand: states what BizGenie holds, never confirms anything on the customer's behalf, and is truthful when loading, failed or absent.
- Channels and Review: planning only; nothing connected, generated, scheduled or published without approval.

**Skip for now** now exists on the two non-essential panels (Brand setup, Channels). It moves on and saves nothing.

## What it is not
No model, no API call, no new data store, no new write path, no website import, no autonomous behaviour. It cannot change an answer. It never claims to be a live AI assistant.

## Dependency for a real conversational Genie
A model-backed Genie would need an approved trusted route to a model service (provider, spend ceiling, tenant-scoped prompts and logging). None exists, and building one is a new backend architecture outside Issue #154's v1 boundary. Documented, not started.

## Evidence
Unit: `genieGuide.test.js` (6) and four component tests in `PremiumOnboarding.panels.test.jsx`. Browser: the Golden Journey. LOCAL PASS only.
