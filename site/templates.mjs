import { company, runtime } from "./config.mjs";
import * as C from "./content.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tbc = (v, strict) => (v ? esc(v) : strict ? "" : `<span class="tbc">to be confirmed before publication</span>`);

export function layout({ title, description, path, body, strict = false, scripts = true }) {
  const canonical = `${company.siteUrl}${path}`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#0b4943">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="bg-api-url" content="${esc(runtime.apiBaseUrl)}">
<meta name="bg-lead-path" content="${esc(runtime.leadPath)}">
<meta name="bg-events-url" content="${esc(runtime.measurement && runtime.apiBaseUrl ? runtime.apiBaseUrl + runtime.eventsPath : "")}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
${header()}
<main id="main" tabindex="-1">
${body}
</main>
${footer(strict)}
${scripts ? `<script type="module" src="/assets/site.js"></script>` : ""}
</body>
</html>
`;
}

function header() {
  return `<header class="site-header">
  <div class="wrap bar">
    <a class="wordmark" href="/" aria-label="BizGenie home">BizGenie</a>
    <nav aria-label="Main">
      <ul>
        <li><a href="/#product">Product</a></li>
        <li><a href="/#how">How it works</a></li>
        <li><a href="/#who">Who it is for</a></li>
        <li><a href="/#founding">Founding customers</a></li>
        <li><a href="/#faq">FAQ</a></li>
      </ul>
    </nav>
    <a class="btn small" href="/#register" data-intent="early_access">Join early access</a>
  </div>
</header>`;
}

function footer(strict) {
  return `<footer class="site-footer">
  <div class="wrap cols">
    <div>
      <p class="wordmark">BizGenie</p>
      <p class="tag">${esc(C.hero.tagline)}</p>
      <p class="fine">${esc(company.legalName)}. Not yet open to the public.</p>
    </div>
    <nav aria-label="Company and legal">
      <ul>
        <li><a href="/#company">Company information</a></li>
        <li><a href="/privacy/">Privacy notice</a></li>
        <li><a href="/terms/">Website terms</a></li>
        <li><a href="/data-deletion/">Data deletion</a></li>
      </ul>
    </nav>
    <div class="fine">
      <p>Contact: ${company.contactEmail ? `<a href="mailto:${esc(company.contactEmail)}">${esc(company.contactEmail)}</a>` : tbc(null, strict)}</p>
    </div>
  </div>
</footer>`;
}

const statusBadge = (s) => `<span class="badge badge-${s}">${esc(C.STATUS[s].label)}</span>`;

function registerForm() {
  const industryOptions = C.industries.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  const intentions = C.intentions.map((i) => `<div class="choice"><input type="radio" id="intent-${i.value}" name="intention" value="${i.value}" required><label for="intent-${i.value}"><strong>${esc(i.label)}</strong><span class="help">${esc(i.help)}</span></label></div>`).join("");
  const priorities = C.priorities.map(([v, l]) => `<div class="check"><input type="checkbox" id="prio-${v}" name="priorities" value="${v}"><label for="prio-${v}">${esc(l)}</label></div>`).join("");
  return `<form id="register-form" class="card form" novalidate method="post" action="#register" aria-labelledby="register-title">
  <div id="form-error-summary" class="error-summary" role="alert" tabindex="-1" hidden>
    <h3>Please check the form</h3>
    <ul></ul>
  </div>
  <fieldset class="field">
    <legend>What would you like? <span class="req">(required)</span></legend>
    <div class="choices">${intentions}</div>
    <p class="error" id="intention-error" hidden></p>
  </fieldset>
  <div class="field">
    <label for="f-name">Your name <span class="req">(required)</span></label>
    <input id="f-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="name-error">
    <p class="error" id="name-error" hidden></p>
  </div>
  <div class="field">
    <label for="f-email">Business email <span class="req">(required)</span></label>
    <input id="f-email" name="email" type="email" autocomplete="email" maxlength="254" inputmode="email" required aria-describedby="email-hint email-error">
    <p class="hint" id="email-hint">Use the address you want us to reply to. A work address is best, but any address you check is fine.</p>
    <p class="error" id="email-error" hidden></p>
  </div>
  <div class="field">
    <label for="f-company">Business or company name <span class="req">(required)</span></label>
    <input id="f-company" name="company" type="text" autocomplete="organization" maxlength="160" required aria-describedby="company-error">
    <p class="error" id="company-error" hidden></p>
  </div>
  <div class="field">
    <label for="f-industry">Industry <span class="req">(required)</span></label>
    <select id="f-industry" name="industry" required aria-describedby="industry-error">${industryOptions}</select>
    <p class="error" id="industry-error" hidden></p>
  </div>
  <fieldset class="field">
    <legend>What matters most to you? <span class="opt">(optional)</span></legend>
    <div class="checks">${priorities}</div>
  </fieldset>
  <div class="field">
    <label for="f-notes">Anything else we should know? <span class="opt">(optional)</span></label>
    <textarea id="f-notes" name="notes" rows="3" maxlength="500" aria-describedby="notes-hint"></textarea>
    <p class="hint" id="notes-hint">Please do not include passwords, social media logins or personal data about other people.</p>
  </div>
  <div class="hp" aria-hidden="true"><label for="f-hp">Leave this field empty</label><input id="f-hp" name="hp_confirm" type="text" tabindex="-1" autocomplete="off"></div>
  <div class="field consent">
    <div class="check"><input type="checkbox" id="c-contact" name="contactConsent" required aria-describedby="contact-error"><label for="c-contact" id="c-contact-label">${esc(C.CONSENT_CONTACT)}</label></div>
    <p class="error" id="contactConsent-error" hidden></p>
    <div class="check"><input type="checkbox" id="c-marketing" name="marketingConsent"><label for="c-marketing" id="c-marketing-label">${esc(C.CONSENT_MARKETING)}</label></div>
    <p class="fine">We use your details as described in the <a href="/privacy/">privacy notice</a>. We never ask for social media passwords or access tokens.</p>
  </div>
  <p id="closed-note" class="notice" hidden>Registration is not open on this preview of the site yet, so nothing can be sent. When it opens, this form will record your interest.</p>
  <div class="actions"><button type="submit" class="btn" id="submit-btn">Register my interest</button><p id="status" class="status" role="status" aria-live="polite"></p></div>
  <div id="success" class="success" role="status" tabindex="-1" hidden>
    <h3>Thank you. We have recorded your interest.</h3>
    <p id="success-text"></p>
    <p class="fine">This does not guarantee an invitation, a launch date or any price. We will contact you at the address you gave if you are invited.</p>
  </div>
</form>`;
}

export function homePage({ strict }) {
  const f = C.features.map((x) => `<article class="card feature" id="feature-${x.id}"><div class="row"><h3>${esc(x.title)}</h3>${statusBadge(x.status)}</div><p>${esc(x.text)}</p><p class="fine">${esc(C.STATUS[x.status].note)}</p></article>`).join("");
  const steps = C.steps.map((s, i) => `<li><span class="n" aria-hidden="true">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("");
  const aud = C.audiences.map((a) => `<li class="card"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join("");
  const prev = C.previews.map((p) => `<figure><img src="/${esc(p.file)}" width="${p.w}" height="${p.h}" alt="${esc(p.alt)}" loading="lazy" decoding="async"><figcaption>${esc(p.caption)}</figcaption></figure>`).join("");
  const terms = C.founding.terms.map((t) => `<li>${esc(t)}</li>`).join("");
  const faq = C.faq.map((q) => `<details><summary>${esc(q.q)}</summary><p>${esc(q.a)}</p></details>`).join("");
  const body = `
<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div>
      <p class="eyebrow">${esc(C.hero.eyebrow)}</p>
      <h1 id="hero-title">${esc(C.hero.title)}</h1>
      <p class="lead">${esc(C.hero.lead)}</p>
      <p class="tagline">${esc(C.hero.tagline)}</p>
      <div class="cta">
        <a class="btn" href="/#register" data-intent="${C.hero.ctaPrimary.intent}">${esc(C.hero.ctaPrimary.label)}</a>
        <a class="btn ghost" href="/#register" data-intent="${C.hero.ctaSecondary.intent}">${esc(C.hero.ctaSecondary.label)}</a>
      </div>
      <p class="fine">${esc(C.hero.honesty)}</p>
    </div>
    <figure class="hero-shot"><img src="/${esc(C.previews[0].file)}" width="${C.previews[0].w}" height="${C.previews[0].h}" alt="${esc(C.previews[0].alt)}" decoding="async"><figcaption>Pre-release product, sample business.</figcaption></figure>
  </div>
</section>

<section id="product" class="band" aria-labelledby="product-title">
  <div class="wrap">
    <h2 id="product-title">One platform for the whole marketing loop</h2>
    <p class="sub">What each part does, and exactly where it stands today.</p>
    <div class="grid3">${f}</div>
    <div class="legend" aria-label="What the labels mean"><span>${statusBadge("pre")} ${esc(C.STATUS.pre.note)}</span><span>${statusBadge("dev")} ${esc(C.STATUS.dev.note)}</span><span>${statusBadge("plan")} ${esc(C.STATUS.plan.note)}</span></div>
  </div>
</section>

<section id="how" aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title">How it works</h2>
    <ol class="steps">${steps}</ol>
  </div>
</section>

<section id="who" class="band" aria-labelledby="who-title">
  <div class="wrap">
    <h2 id="who-title">Who it is for</h2>
    <ul class="grid3 plain">${aud}</ul>
  </div>
</section>

<section id="previews" aria-labelledby="prev-title">
  <div class="wrap">
    <h2 id="prev-title">A look at the pre-release product</h2>
    <div class="shots">${prev}</div>
    <p class="fine">${esc(C.previewNote)}</p>
  </div>
</section>

<section id="founding" class="band founding" aria-labelledby="founding-title">
  <div class="wrap narrow">
    <h2 id="founding-title">${esc(C.founding.title)}</h2>
    <p>${esc(C.founding.text)}</p>
    <ul class="ticks">${terms}</ul>
    <a class="btn" href="/#register" data-intent="founding_customer">Register as a founding customer</a>
  </div>
</section>

<section id="register" aria-labelledby="register-title">
  <div class="wrap narrow">
    <h2 id="register-title">Register your interest</h2>
    <p class="sub">Choose early access for updates and an invitation, or founding customer if your business may become a paying subscriber when BizGenie is ready.</p>
    ${registerForm()}
  </div>
</section>

<section id="faq" class="band" aria-labelledby="faq-title">
  <div class="wrap narrow">
    <h2 id="faq-title">Questions</h2>
    ${faq}
  </div>
</section>

<section id="company" aria-labelledby="company-title">
  <div class="wrap narrow">
    <h2 id="company-title">Company information</h2>
    <dl class="facts">
      <dt>Company</dt><dd>${esc(company.legalName)}</dd>
      <dt>Trading as</dt><dd>${esc(company.tradingName)}</dd>
      <dt>Website</dt><dd>${esc(company.domain)}</dd>
      <dt>Company number</dt><dd>${tbc(company.companyNumber, strict)}</dd>
      <dt>Registered office</dt><dd>${tbc(company.registeredOffice, strict)}</dd>
      <dt>Contact</dt><dd>${company.contactEmail ? `<a href="mailto:${esc(company.contactEmail)}">${esc(company.contactEmail)}</a>` : tbc(null, strict)}</dd>
      <dt>Privacy contact</dt><dd>${company.privacyContactEmail ? `<a href="mailto:${esc(company.privacyContactEmail)}">${esc(company.privacyContactEmail)}</a>` : tbc(null, strict)}</dd>
    </dl>
    <p>Read the <a href="/privacy/">privacy notice</a>, the <a href="/terms/">website terms</a> and how to <a href="/data-deletion/">ask for your data to be deleted</a>.</p>
  </div>
</section>`;
  return layout({
    title: "BizGenie — Your AI Marketing Operating System",
    description: "Brand intelligence, creative production, campaign planning, publishing workflows and performance learning in one platform. Join early access.",
    path: "/", body, strict,
  });
}

const draftNotice = (strict) => (company.legalReviewed ? "" : `<p class="notice" role="note"><strong>Draft for legal review.</strong> This text describes how BizGenie is designed to work. It must be checked against the live system and approved before this site is published.</p>`);

export function privacyPage({ strict }) {
  const body = `<article class="wrap narrow prose">
  <h1>Privacy notice</h1>
  ${draftNotice(strict)}
  <p><strong>${esc(company.legalName)}</strong> ("BizGenie", "we") is responsible for the personal data described here. Contact for privacy questions: ${company.privacyContactEmail ? `<a href="mailto:${esc(company.privacyContactEmail)}">${esc(company.privacyContactEmail)}</a>` : tbc(null, strict)}.</p>
  <h2>What this notice covers</h2>
  <p>This notice covers this website and its registration form. BizGenie is not yet open to the public, and there is no BizGenie account on this site.</p>
  <h2>What we collect, and why</h2>
  <table>
    <thead><tr><th scope="col">What</th><th scope="col">Why</th><th scope="col">Our basis</th></tr></thead>
    <tbody>
      <tr><th scope="row">Name, email, business name, industry and the type of registration you choose</th><td>To record your interest and contact you about early access</td><td>Your consent, which you can withdraw</td></tr>
      <tr><th scope="row">Optional: what matters to you, and anything you add in the notes box</th><td>To understand what to build and to decide who to invite</td><td>Your consent</td></tr>
      <tr><th scope="row">Optional: agreement to receive product news</th><td>To send occasional news about BizGenie</td><td>Your separate consent. Unticked by default</td></tr>
      <tr><th scope="row">The wording you agreed to, its version and the time you agreed</th><td>To prove what you consented to</td><td>Legal obligation to demonstrate consent</td></tr>
      <tr><th scope="row">Where you came from (for example the campaign tag in a link, or the website that linked to us)</th><td>To understand which channels bring interested businesses</td><td>Legitimate interests</td></tr>
      <tr><th scope="row">A one-way pseudonym of your connection, held briefly</th><td>To limit automated abuse of the form. Your raw IP address is not stored with your registration</td><td>Legitimate interests</td></tr>
    </tbody>
  </table>
  <p>We do <strong>not</strong> ask for social media passwords, access tokens or payment details on this site, and you should not enter them.</p>
  <h2>Measuring the website</h2>
  <p>We count visits and form steps (for example, that someone started the form, or which field had an error) so we can improve the site. This does not use cookies or local storage, does not record what you type, and is not shared with advertising companies. If your browser sends Do Not Track or Global Privacy Control, we do not send these counts at all.</p>
  <h2>Who receives your data</h2>
  <p>Our hosting and infrastructure providers process data for us to run the site and store registrations. We do not sell your data. The full list of providers: ${company.legalReviewed ? "see below" : tbc(null, strict)}.</p>
  <h2>How long we keep it</h2>
  <p>${company.retentionDecision ? esc(company.retentionDecision) : tbc(null, strict)}</p>
  <h2>Your rights</h2>
  <p>You can ask to see, correct or delete your data, to object to or restrict its use, and to withdraw consent at any time, including for product news (every message will have an unsubscribe link). To do this, contact us using the details above or use the <a href="/data-deletion/">data-deletion page</a>. You can complain to the Information Commissioner's Office (ico.org.uk) if you are unhappy with how we handle your data.</p>
  <h2>Transfers outside the UK</h2>
  <p>${tbc(null, strict)}</p>
  <h2>Changes</h2>
  <p>If we change this notice we will update this page. If we ever connect social media accounts to BizGenie, we will explain exactly what is collected and why before you connect anything.</p>
</article>`;
  return layout({ title: "Privacy notice — BizGenie", description: "How BizGenie collects and uses personal data on this website.", path: "/privacy/", body, strict });
}

export function termsPage({ strict }) {
  const body = `<article class="wrap narrow prose">
  <h1>Website terms</h1>
  ${draftNotice(strict)}
  <p>These terms apply to your use of this website, operated by <strong>${esc(company.legalName)}</strong>. They are not the terms of a BizGenie subscription: those will be provided before anyone subscribes.</p>
  <h2>Information only</h2>
  <p>This site describes a product that is not yet generally available. Nothing here is an offer, a promise of a place, a launch date, a price, a discount or a feature. Features, availability and appearance may change.</p>
  <h2>Registering your interest</h2>
  <p>Registering is free and creates no contract and no obligation on either side. We decide who to invite and when. We may decline or not respond to a registration.</p>
  <h2>Acceptable use</h2>
  <p>Please give accurate details and do not use the form to send unlawful, misleading or harmful material or to attack or overload the site. We may block abusive traffic.</p>
  <h2>Our content</h2>
  <p>The text, design and screenshots on this site belong to ${esc(company.legalName)} or its licensors. You may view and share links to the site but may not copy it as your own.</p>
  <h2>Liability</h2>
  <p>Nothing here limits liability that cannot lawfully be limited. Otherwise the site is provided as is, and we are not responsible for decisions made in reliance on it. ${tbc(null, strict)}</p>
  <h2>Governing law</h2>
  <p>${tbc(null, strict)}</p>
  <h2>Contact</h2>
  <p>${company.contactEmail ? `<a href="mailto:${esc(company.contactEmail)}">${esc(company.contactEmail)}</a>` : tbc(null, strict)}</p>
</article>`;
  return layout({ title: "Website terms — BizGenie", description: "Terms for using the BizGenie website.", path: "/terms/", body, strict });
}

export function deletionPage({ strict }) {
  const body = `<article class="wrap narrow prose">
  <h1>Ask for your data to be deleted</h1>
  ${draftNotice(strict)}
  <p>If you registered your interest and want your details removed, or want to withdraw consent, tell us.</p>
  <h2>How to ask</h2>
  <ol>
    <li>Email ${company.privacyContactEmail ? `<a href="mailto:${esc(company.privacyContactEmail)}">${esc(company.privacyContactEmail)}</a>` : tbc(null, strict)} from the address you registered with, with the subject "Delete my data".</li>
    <li>If you no longer have access to that address, tell us the business name and the date you registered. We may ask a question to check it is you.</li>
  </ol>
  <h2>What happens next</h2>
  <p>We will confirm what we hold and delete it without undue delay and within one month, unless the law requires us to keep something, in which case we will tell you what and why. We will also stop product news immediately if you withdraw that consent.</p>
  <h2>Social media connections</h2>
  <p>This website does not connect to your social media accounts and holds no tokens for them. If BizGenie later offers account connections, you will be able to disconnect them in the product, remove BizGenie in the settings of the platform concerned, and ask us here to delete the related data.</p>
  <p>More: <a href="/privacy/">privacy notice</a>.</p>
</article>`;
  return layout({ title: "Data deletion — BizGenie", description: "How to ask BizGenie to delete your data.", path: "/data-deletion/", body, strict });
}

export function notFoundPage({ strict }) {
  const body = `<section class="wrap narrow prose"><h1>Page not found</h1><p>That page does not exist. <a href="/">Go to the home page</a>.</p></section>`;
  return layout({ title: "Page not found — BizGenie", description: "The page you asked for does not exist on the BizGenie website.", path: "/404.html", body, strict, scripts: false });
}
