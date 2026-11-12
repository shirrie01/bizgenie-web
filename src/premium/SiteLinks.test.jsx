import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SiteLinks, { SupportNote, resolveLink, supportHref } from "./SiteLinks";

afterEach(cleanup);
describe("SiteLinks (BG-LAUNCH-015)", () => {
  it("nothing configured: every destination is shown as not set up, and none is a link", () => {
    render(<SiteLinks env={{}} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    for (const t of ["Help and support: not set up yet", "Terms: not set up yet", "Privacy: not set up yet"]) expect(screen.getByText(t)).toBeInTheDocument();
  });
  it("configured https and mailto destinations become links; only support may be mailto", () => {
    render(<SiteLinks env={{ VITE_SUPPORT_URL: "mailto:help@example.test", VITE_TERMS_URL: "https://example.test/terms", VITE_PRIVACY_URL: "mailto:x@example.test" }} />);
    expect(screen.getByRole("link", { name: "Help and support" })).toHaveAttribute("href", "mailto:help@example.test");
    expect(screen.getByRole("link", { name: /^Terms/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Privacy: not set up yet")).toBeInTheDocument();
  });
  it.each([["http://example.test/x"], ["javascript:alert(1)"], ["https://user:pw@example.test/"], ["https://localhost/"], ["//example.test"], ["  "], [undefined], [5]])("%s is refused", (v) => expect(resolveLink(v, { allowMail: true })).toBeNull());
  // BG-WEB-LEGAL-CLOSURE-13
  it.each([["https://127.0.0.1/terms"], ["https://192.168.1.10/"], ["https://[::1]/"], ["mailto:a@example.test,b@example.test"], ["mailto:a@example.test?subject=x"], ["http://example.test"], ["ftp://example.test/x"], ["data:text/html,hi"]])("%s is refused", (v) => expect(resolveLink(v, { allowMail: true })).toBeNull());
  it("a mailto: address is never offered for Terms or Privacy", () => {
    expect(resolveLink("mailto:help@example.test")).toBeNull();
    expect(resolveLink("mailto:help@example.test", { allowMail: true })).toBe("mailto:help@example.test");
  });
  it("an https link opens in a new tab safely and says so to assistive technology; a mailto link does not", () => {
    render(<SiteLinks env={{ VITE_SUPPORT_URL: "mailto:help@example.test", VITE_TERMS_URL: "https://example.test/terms", VITE_PRIVACY_URL: "https://example.test/privacy" }} />);
    const terms = screen.getByRole("link", { name: /^Terms/ });
    expect(terms).toHaveAttribute("target", "_blank"); expect(terms).toHaveAttribute("rel", "noopener noreferrer");
    expect(terms).toHaveAccessibleName("Terms (opens in a new tab)");
    const help = screen.getByRole("link", { name: "Help and support" });
    expect(help).not.toHaveAttribute("target"); expect(help).toHaveAttribute("href", "mailto:help@example.test");
  });
  it("is a labelled footer region with a list and one factual AI notice that makes no legal or price claim", () => {
    render(<SiteLinks env={{}} />);
    expect(screen.getByRole("contentinfo", { name: "Help and legal" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const note = screen.getByText(/uses AI to draft text, images and video/);
    expect(note.textContent).not.toMatch(/£|\d|legal|approved by|guarantee/i);
  });
  it("missing or invalid settings never produce a link, an empty href or a broken anchor", () => {
    render(<SiteLinks env={{ VITE_SUPPORT_URL: "not a url", VITE_TERMS_URL: "javascript:alert(1)", VITE_PRIVACY_URL: "https://localhost" }} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("a[href='']")).toBeNull(); expect(document.querySelector("a[href='#']")).toBeNull();
  });
  it("billing support note: the configured destination when valid, the honest 'not published' sentence when not", () => {
    expect(supportHref({})).toBeNull();
    const { container, rerender } = render(<p><SupportNote env={{}} /></p>);
    expect(container.textContent).toBe("A support contact has not been published yet.");
    rerender(<p><SupportNote env={{ VITE_SUPPORT_URL: "https://example.test/support" }} /></p>);
    expect(screen.getByRole("link", { name: /Contact support/ })).toHaveAttribute("href", "https://example.test/support");
    rerender(<p><SupportNote env={{ VITE_SUPPORT_URL: "http://example.test/support" }} /></p>);
    expect(container.textContent).toBe("A support contact has not been published yet.");
  });
});
