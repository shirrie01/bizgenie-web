import React from "react";

// Support and legal destinations come only from build-time settings. None is invented: an address that is not set, or is not a plain
// https link (support may also be mailto:), is shown as "not set up yet" instead of a link (BG-LAUNCH-015). Legal text is not written here.
const ITEMS = [
  { key: "VITE_SUPPORT_URL", label: "Help and support", allowMail: true },
  { key: "VITE_TERMS_URL", label: "Terms" },
  { key: "VITE_PRIVACY_URL", label: "Privacy" },
];

export function resolveLink(raw, { allowMail = false } = {}) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (allowMail && /^mailto:[^\s@?#]+@[^\s@?#]+\.[^\s@?#]+$/i.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.href;
  } catch { return null; }
}

export default function SiteLinks({ env = import.meta.env }) {
  const items = ITEMS.map((i) => ({ ...i, href: resolveLink(env && env[i.key], { allowMail: i.allowMail }) }));
  return (
    <footer className="ps-sitelinks" aria-label="Help and legal">
      <ul>
        {items.map((i) => (
          <li key={i.key}>
            {i.href
              ? <a href={i.href} target={i.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer">{i.label}</a>
              : <span>{i.label}: not set up yet</span>}
          </li>
        ))}
      </ul>
    </footer>
  );
}
