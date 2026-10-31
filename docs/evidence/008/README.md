# BG-STUDIO-008-FE evidence index

All screenshots come from local builds with the login session and (except `real-handlers/`) the API mocked in the browser. **None is a deployed customer journey.**

| Folder | What it shows | Real | Mocked |
|---|---|---|---|
| `before/` | The current application with the flag off (home, and with a campaign), 1440, 768, 390, 320 | production code | session, API; billing shows an unverified state because the mock has no billing endpoint |
| `after/` | The flag-on production build at four widths: onboarding 1 to 7, workspaces for vehicle leasing, fragrance, aesthetics, soft drinks, charity and unknown customers, a completed Campaign Studio approval, workspace after onboarding, Brand Brain failure, incomplete profile, signed out | production code and real request shapes | session, API |
| `real-handlers/` | PNG, VP9 MP4, media revoked mid-review, Instagram-feed video 409 and revoked-from-start, through the premium shell; `summary.json` lists the 12 runs | the real #208 request handlers (in-memory repository, stub auth, mocked storage with real bytes) | browser session; non-review reads |
| `flag-off-dom-equivalence/` | Script and SHA-256 hashes showing the flag-off DOM is identical to the base across 7 states | production code | API responses |

File names in `after/` are `<width>-<screen>.png`.
