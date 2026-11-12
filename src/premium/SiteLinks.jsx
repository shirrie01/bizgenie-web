import React from "react";

// Support and legal destinations come only from build-time settings. None is invented: an address that is not set, or is not a plain
// https link (support may also be mailto:), is shown as "not set up yet" instead of a link (BG-LAUNCH-015). Legal text is not written here.
// BG-WEB-LEGAL-CLOSURE-13: also refuses an IP-address host, tells assistive technology that a link opens a new tab, shows the same footer in every
// Studio view, and lets billing screens point at the configured support destination instead of saying none exists.
const ITEMS = [
  { key: "VITE_SUPPORT_URL", label: "Help and support", allowMail: true },
  { key: "VITE_TERMS_URL", label: "Terms" },
  { key: "VITE_PRIVACY_URL", label: "Privacy" },
];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function resolveLink(raw, { allowMail = false } = {}) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (allowMail && /^mailto:[^\s@?#,;]+@[^\s@?#,;]+\.[^\s@?#,;]+$/i.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    if (IPV4.test(u.hostname) || u.hostname.startsWith("[")) return null; // a legal or support page lives on a named host, never a bare address
    return u.href;
  } catch { return null; }
}

export const supportHref = (env = import.meta.env) => resolveLink(env && env.VITE_SUPPORT_URL, { allowMail: true });

function Out({ href, children }) {
  const mail = href.startsWith("mailto:");
  return (
    <a href={href} {...(mail ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
      {children}{!mail && <span className="visually-hidden"> (opens in a new tab)</span>}
    </a>
  );
}

// Billing screens: a link to the configured support destination, otherwise the honest "not published" sentence.
export function SupportNote({ env = import.meta.env, fallback = "A support contact has not been published yet." }) {
  const href = supportHref(env);
  return href ? <>Need help? <Out href={href}>Contact support</Out>.</> : <>{fallback}</>;
}

export default function SiteLinks({ env = import.meta.env }) {
  const items = ITEMS.map((i) => ({ ...i, href: resolveLink(env && env[i.key], { allowMail: i.allowMail }) }));
  return (
    <footer className="ps-sitelinks" aria-label="Help and legal">
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            {i.href ? <Out href={i.href}>{i.label}</Out> : <span>{i.label}: not set up yet</span>}
          </li>
        ))}
      </ul>
      <p className="ps-sitelinks-note">BizGenie uses AI to draft text, images and video. Drafts can contain mistakes, so check everything before you use it. Nothing is published without your approval.</p>
    </footer>
  );
}
