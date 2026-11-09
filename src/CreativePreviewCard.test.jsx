// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import CreativePreviewCard, { creativeAsText, hasCreativeText, normalizeCreative } from "./CreativePreviewCard";

afterEach(cleanup);
const ASSET = "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21";
const content = { title: "Spring offer", body: "Book a free consultation this week.", caption: "Limited places. #spring", alt_text: "A smiling adviser at a desk", asset_refs: [{ asset_id: ASSET, role: "primary" }] };
const variant = (over = {}) => ({ variant_id: "v1", platform: "instagram", placement: "feed", destination_label: "Instagram", current_content: content, ...over });

describe("normalizeCreative", () => {
  it("reads the persisted revision shape and drops malformed asset refs", () => {
    expect(normalizeCreative({ ...content, asset_refs: [{ asset_id: ASSET, role: "primary" }, null, { role: "primary" }, { asset_id: "x", role: "other" }] }).assets)
      .toEqual([{ id: ASSET, role: "primary" }, { id: "x", role: "supporting" }]);
  });
  it("accepts legacy strings and rejects non-content without throwing", () => {
    expect(normalizeCreative("Legacy copy").body).toBe("Legacy copy");
    for (const bad of [null, undefined, 42, [], { title: 5, body: "  " }]) expect(hasCreativeText(bad)).toBe(false);
  });
  it("joins title, body and caption for a single copyable value", () => {
    expect(creativeAsText(content)).toBe("Spring offer\n\nBook a free consultation this week.\n\nLimited places. #spring");
    expect(creativeAsText(null)).toBe("");
  });
});

describe("CreativePreviewCard", () => {
  it("shows the persisted title, body, caption and alt text in a platform-labelled card", () => {
    render(<CreativePreviewCard variant={variant()} />);
    const card = within(screen.getByRole("figure", { name: /creative preview for instagram/i }));
    expect(card.getByRole("heading", { name: "Spring offer" })).toBeInTheDocument();
    expect(card.getByText("Book a free consultation this week.")).toBeInTheDocument();
    expect(card.getByText("Limited places. #spring")).toBeInTheDocument();
    expect(card.getByText("A smiling adviser at a desk")).toBeInTheDocument();
    expect(card.getByText("feed")).toBeInTheDocument();
  });

  it("shows only a real asset reference and never fakes an image", () => {
    const { container } = render(<CreativePreviewCard variant={variant()} />);
    expect(screen.getByText(/primary visual attached/i)).toBeInTheDocument();
    expect(screen.getByText(/reference 9b2f7c1e/i)).toBeInTheDocument();
    expect(screen.getByText(/can’t be shown here yet/i)).toBeInTheDocument();
    expect(container.querySelector("img, video, canvas, svg")).toBeNull();
  });

  it("says so plainly when no visual is attached and does not ask for alt text", () => {
    render(<CreativePreviewCard variant={variant({ current_content: { ...content, asset_refs: [], alt_text: null } })} />);
    expect(screen.getByText(/no visual is attached/i)).toBeInTheDocument();
    expect(screen.queryByText(/image description/i)).toBeNull();
  });

  it("flags missing alt text when a visual is attached", () => {
    render(<CreativePreviewCard variant={variant({ current_content: { ...content, alt_text: null } })} />);
    expect(screen.getByText(/none provided/i)).toBeInTheDocument();
  });

  it("lays an email out as a subject line, not a heading", () => {
    render(<CreativePreviewCard variant={variant({ platform: "email", placement: "message", destination_label: "Email", current_content: { ...content, asset_refs: [] } })} />);
    expect(screen.queryByRole("heading", { name: "Spring offer" })).toBeNull();
    expect(screen.getByText(/subject/i).closest("p")).toHaveTextContent("Spring offer");
  });

  it("renders unknown platforms generically and shows the destination label", () => {
    render(<CreativePreviewCard variant={variant({ platform: "other", destination_label: "Partner newsletter" })} />);
    expect(screen.getByRole("figure", { name: /creative preview for partner newsletter/i })).toBeInTheDocument();
  });

  it("escapes markup in customer or generated text", () => {
    const { container } = render(<CreativePreviewCard variant={variant({ current_content: { ...content, body: "<img src=x onerror=alert(1)> hi", asset_refs: [] } })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> hi/)).toBeInTheDocument();
  });

  it("handles a version with no saved text", () => {
    render(<CreativePreviewCard variant={variant({ current_content: null })} />);
    expect(screen.getByText(/no saved text/i)).toBeInTheDocument();
  });
});
