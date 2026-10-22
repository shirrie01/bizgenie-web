// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CreativeReviewPanel, { currentReviewStep, receiptFacts } from "./CreativeReviewPanel";

afterEach(cleanup);
const variant = { variant_id: "v1", destination_label: "Instagram", current_content: "Launch copy", workflow: "review" };
const idle = { status: "idle", variantId: "", receipt: null, previewId: "", error: "" };

function setup(state = idle, overrides = {}) {
  const props = { variant, state, onRender: vi.fn(), onAcknowledge: vi.fn(), onApprove: vi.fn(), ...overrides };
  render(<CreativeReviewPanel {...props} />);
  return props;
}
const mine = (patch) => ({ ...idle, variantId: "v1", ...patch });

describe("CreativeReviewPanel", () => {
  it("derives the step from state, keeping the failed step on error", () => {
    expect(currentReviewStep(idle)).toBe(0);
    expect(currentReviewStep(mine({ status: "rendered", receipt: {} }))).toBe(1);
    expect(currentReviewStep(mine({ status: "acknowledged", previewId: "p" }))).toBe(2);
    expect(currentReviewStep(mine({ status: "error", receipt: {} }))).toBe(1);
    expect(currentReviewStep(mine({ status: "error", receipt: {}, previewId: "p" }))).toBe(2);
    expect(currentReviewStep(mine({ status: "error" }))).toBe(0);
  });

  it("shows a labelled three-step list with only the current step marked", () => {
    setup();
    const steps = within(screen.getByRole("list", { name: /review steps/i })).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("status")).toHaveTextContent(/step 1 of 3/i);
  });

  it("offers a single primary action that matches the step", () => {
    const props = setup(mine({ status: "rendered", receipt: { render_receipt_id: "r" } }));
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^acknowledge preview$/i }));
    expect(props.onAcknowledge).toHaveBeenCalledWith(variant);
    expect(screen.getByRole("list", { name: /review steps/i }).querySelector(".done")).toHaveTextContent(/render preview/i);
  });

  it("states that approval does not publish", () => {
    setup(mine({ status: "acknowledged", receipt: {}, previewId: "p" }));
    expect(screen.getByRole("status")).toHaveTextContent(/nothing is scheduled or published/i);
    expect(screen.getByRole("button", { name: /^approve$/i })).toBeEnabled();
  });

  it("shows loading and blocks every action while a request is in flight", () => {
    setup(mine({ status: "rendering" }));
    const busy = screen.getByRole("button", { name: /rendering preview/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it("blocks actions on other variants while one is busy", () => {
    setup({ ...idle, status: "approving", variantId: "other" });
    expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
  });

  it("shows an empty state and disables rendering when there is no copy", () => {
    setup(idle, { variant: { ...variant, current_content: "" } });
    expect(screen.getByText(/no generated copy to review yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
  });

  it("announces errors inline and lets the reviewer retry the failed step", () => {
    const props = setup(mine({ status: "error", receipt: { render_receipt_id: "r" }, error: "Preview could not be acknowledged yet." }));
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be acknowledged/i);
    fireEvent.click(screen.getByRole("button", { name: /^acknowledge preview$/i }));
    expect(props.onAcknowledge).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start again/i }));
    expect(props.onRender).toHaveBeenCalledWith(variant);
  });

  it("does not show another variant's error", () => {
    setup({ ...idle, status: "error", variantId: "other", error: "nope" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("places the error before the action buttons so it is read and seen first", () => {
    setup(mine({ status: "error", receipt: {}, error: "Preview could not be acknowledged yet." }));
    const alert = screen.getByRole("alert");
    const firstButton = screen.getAllByRole("button")[0];
    expect(alert.compareDocumentPosition(firstButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows only the receipt facts the server returned, without claiming a visual preview", () => {
    const receipt = { render_receipt_id: "r", platform: "instagram", placement: "feed", format: "text", profile_version: 2, preview_digest: "abcdef0123456789ff", rendered_at: "2026-10-22T09:00:00Z" };
    setup(mine({ status: "rendered", receipt }));
    const facts = within(screen.getByLabelText("Preview receipt"));
    expect(facts.getByText("Instagram · Feed · Text")).toBeInTheDocument();
    expect(facts.getByText("Version 2")).toBeInTheDocument();
    expect(facts.getByText("abcdef012345")).toBeInTheDocument();
    expect(screen.getByText(/visual preview is not available yet/i)).toBeInTheDocument();
  });

  it("omits the receipt block when the server returned no displayable fields", () => {
    expect(receiptFacts({ render_receipt_id: "r" })).toEqual([]);
    expect(receiptFacts({ rendered_at: "not a date" })).toEqual([]);
    setup(mine({ status: "rendered", receipt: { render_receipt_id: "r" } }));
    expect(screen.queryByLabelText("Preview receipt")).toBeNull();
  });

  it("offers reload instead of a doomed retry when the campaign is stale", () => {
    const props = setup(mine({ status: "error", receipt: {}, stale: true, error: "This campaign changed since you opened it." }), { onReload: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent(/campaign changed/i);
    expect(screen.queryByRole("button", { name: /^acknowledge preview$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /start again/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /reload latest campaign/i }));
    expect(props.onReload).toHaveBeenCalled();
  });

  it("blocks actions while the latest campaign is loading", () => {
    setup(mine({ status: "reloading", receipt: {} }));
    expect(screen.getByRole("status")).toHaveTextContent(/loading the latest campaign/i);
    screen.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
  });
});
