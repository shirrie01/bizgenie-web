import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SiteLinks, { resolveLink } from "./SiteLinks";

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
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("Privacy: not set up yet")).toBeInTheDocument();
  });
  it.each([["http://example.test/x"], ["javascript:alert(1)"], ["https://user:pw@example.test/"], ["https://localhost/"], ["//example.test"], ["  "], [undefined], [5]])("%s is refused", (v) => expect(resolveLink(v, { allowMail: true })).toBeNull());
});
