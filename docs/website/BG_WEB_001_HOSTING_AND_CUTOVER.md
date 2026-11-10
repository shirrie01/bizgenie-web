# BG-WEB-001 — proposed hosting, DNS cutover and rollback for getbizgenie.com

27 October 2026. **Plan only. No DNS change, hosting account, certificate, deployment or paid service was created or touched.** The current state of `getbizgenie.com` (a GoDaddy "Launching Soon" page) could not be inspected from this environment, so every "current" statement below is something to **capture first**, not an assumption.

## 1. What is being deployed

A static site (`npm run site:build:strict` → `site-dist/`): HTML, one CSS file, three small JS modules, three JPEG previews, `robots.txt`, `sitemap.xml`. No server runtime, no database, no third-party scripts, fonts or trackers. The only dynamic dependency is the lead-capture API (a separate, separately approved service; see the contract). The Premium application is **not** part of this deployment and is not touched.

Publication gate: the strict build refuses to run while the founder-only facts are unresolved (company number, registered office, contact and privacy emails, legal-review flag, retention decision, API URL). A draft build is `Disallow: /` in `robots.txt` so a preview cannot be indexed by accident.

## 2. Hosting options (decision needed)

| Option | Fit | Notes / cost |
|---|---|---|
| **A. Firebase Hosting** (Google) | Same cloud as the API (Cloud Run); managed TLS, CDN, preview channels, instant rollback to a previous release | Free tier likely sufficient; needs a Firebase/GCP project and billing decision. Headers set in `firebase.json` from `headers.reference.json` |
| **B. Cloud Storage + HTTPS load balancer + Cloud CDN** | Lets **Cloud Armor** rate-limit/WAF both the site and the API at one edge | More configuration; load balancer has a standing monthly cost |
| C. Cloudflare Pages | Strong free WAF/rate limiting and preview deployments | New vendor and a DNS-hosting decision |
| D. Keep GoDaddy's builder | — | Cannot set the strict CSP/headers, cannot host this build as-is; not recommended |

Recommendation: **A** for the site now, with edge rate limiting for the lead API decided separately (B/Cloud Armor or the API's own bucket plus platform limits). Choose by: where billing already lives, who administers DNS, and the WAF requirement. No account has been created.

Required response headers on every response (reference file `headers.reference.json`): the strict CSP (no `unsafe-inline`; `connect-src` limited to the site and the API origin), `Strict-Transport-Security` (start with a short `max-age` such as 3600 for the first week, then raise; **do not** add `preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`. `index.html` and legal pages `no-cache`; asset files cacheable (file names are not hashed yet, so a short max-age).

## 3. Step 0 — capture the current state (read-only, before anything else)

1. Who is the **registrar** and who hosts **DNS** (they can differ). Export the full zone (screenshot or zone export) and store it in the repository's private ops notes, not in a public repo.
2. Record every existing record: apex `A`/`AAAA`, `www` `CNAME`/`A`, **MX**, **TXT (SPF, DKIM selectors, DMARC, domain-verification tokens such as Google/Meta)**, `CAA`, `NS`, current TTLs.
3. Confirm whether **email is in use** on the domain. If yes, the cutover must change **only** the web records.
4. Note the existing GoDaddy site's publish state and how to republish it (it is the rollback target).
5. `dig +short getbizgenie.com A`, `dig +short www.getbizgenie.com`, `curl -sI https://getbizgenie.com/` and save the output with a timestamp.

Domain-verification TXT records (for example for a Meta app/business) must be preserved untouched.

## 4. Rehearsal on a non-production hostname (no DNS change to the real domain)

1. Deploy the strict build to the host's own preview URL (A: a preview channel) with `SITE_API_URL` pointing at the **non-production** lead API (or leave the form closed).
2. Run the checks against it: `npm run site:test`, `npm run site:browser` with `baseURL` set to the preview, a manual pass on a real phone, `securityheaders`-style header check, TLS check, and `curl` for 404 handling.
3. Founder review of the preview: copy, legal text, company facts, previews.
4. Confirm the lead API's CORS allow-list contains the preview origin and (later) `https://getbizgenie.com`.

## 5. Cutover (needs the founder's separate written approval; not authorised now)

Preconditions: contract implemented and enabled in the target environment (or the form deliberately shipped closed), legal sign-off, strict build green, rollback record captured, a quiet period chosen, someone watching.

1. **T-48h:** lower the TTL of the records that will change to 300 s (leave MX/TXT as they are).
2. **T-0:** add the host's domain-verification record if required; issue the certificate (managed) and wait until it is `active` on the host.
3. Change **only** the apex and `www` web records to the host's values (apex `A`/`AAAA` or `ALIAS`, `www` `CNAME`). Do not edit MX, SPF, DKIM, DMARC or verification TXT.
4. Verify: `dig` from two resolvers, `curl -sI https://getbizgenie.com/` (headers, 200, CSP), `https://www.getbizgenie.com/` redirect to the apex (or the reverse; pick one canonical), the form submits to the **production** API in a controlled test with a clearly labelled test address, then remove that test record via the operator deletion procedure.
5. **T+24h:** if stable, raise the TTL again; raise HSTS `max-age` in stages.

## 6. Rollback

* **Trigger:** TLS or header failure, form failing, wrong content, or any legal/accuracy problem found after launch.
* **Action:** restore the web records to the exact values captured in step 0 (a one-change revert; effective within the lowered TTL, about 5 minutes). The old GoDaddy site was left published and untouched, so it comes back as it was.
* If only the form is faulty: set `SITE_API_URL` empty and redeploy (the form shows "Registration is not open" and sends nothing) while DNS stays as is; or roll the host back to the previous release (A keeps release history).
* Registrations received before a rollback remain in the API's tables; nothing is lost by reverting the web records.
* Do not delete the previous site, the DNS export or the host's earlier releases for at least 30 days.

## 7. Things not authorised and not done

DNS edits, host/account creation, certificates, paid services, email sending, production secrets, enabling the lead route or CORS in any environment, Meta configuration, public activation.
