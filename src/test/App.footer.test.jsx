// BG-WEB-LEGAL-CLOSURE-13: the help/legal footer is in EVERY Studio view (flag on or off, signed out or in), shows only configured https/mailto destinations,
// and never invents one. Local jsdom only; not hosted acceptance.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();
vi.mock("../billingClient", async (importOriginal) => ({ ...(await importOriginal()), readCustomerBillingState: vi.fn().mockResolvedValue({ status: "not_subscribed", subscription: null }) }));
vi.mock("../session", () => ({ getCustomerSession: (...a) => getCustomerSessionMock(...a), refreshCustomerSession: vi.fn() }));
vi.mock("../authClient", () => ({ onAuthStateChange: vi.fn(() => () => {}), signOut: vi.fn(), signInWithPassword: vi.fn(), signUpWithPassword: vi.fn() }));

beforeEach(() => { window.scrollTo = vi.fn(); getCustomerSessionMock.mockReset(); getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
  global.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) })); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe.each([["Premium Studio on", "true"], ["Premium Studio off (original view)", "false"]])("footer — %s", (_n, flag) => {
  it("signed out: the footer is present, nothing configured means three 'not set up yet' notes and no links in it", async () => {
    vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", flag);
    render(<App />);
    const footer = await screen.findByRole("contentinfo", { name: "Help and legal" });
    expect(footer).toHaveTextContent("Help and support: not set up yet");
    expect(footer).toHaveTextContent("Terms: not set up yet");
    expect(footer).toHaveTextContent("Privacy: not set up yet");
    expect(footer.querySelectorAll("a")).toHaveLength(0);
  });
  it("configured destinations are links with safe attributes", async () => {
    vi.stubEnv("VITE_PREMIUM_STUDIO_ENABLED", flag);
    vi.stubEnv("VITE_SUPPORT_URL", "mailto:help@example.test"); vi.stubEnv("VITE_TERMS_URL", "https://example.test/terms"); vi.stubEnv("VITE_PRIVACY_URL", "https://example.test/privacy");
    render(<App />);
    const footer = await screen.findByRole("contentinfo", { name: "Help and legal" });
    const links = footer.querySelectorAll("a");
    expect(links).toHaveLength(3);
    for (const a of links) if (a.getAttribute("href").startsWith("https:")) { expect(a).toHaveAttribute("target", "_blank"); expect(a.getAttribute("rel")).toBe("noopener noreferrer"); }
  });
});
