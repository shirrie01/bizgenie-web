// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import BrandBrainProfile, { updateField } from "./BrandBrainProfile";
afterEach(cleanup);
const brain = {
  brand_id: "brand-internal",
  project_id: "project-internal",
  name: "Fairway Brands & Distribution",
  identity: { description: "Customer-provided website or profile" },
  commercial: { primary_cta: "Grow trade demand" },
  metadata: { version: 9, status: "approved" },
  extra: { preserve: true },
};
describe("customer Brand Brain", () => {
  it("shows customer fields without exposing internal identifiers or JSON", () => {
    render(<BrandBrainProfile brain={brain} onChange={() => {}} />);
    expect(screen.getByLabelText("Brand or business name").value).toBe(brain.name);
    expect(screen.getByLabelText("Business description").value).toBe(brain.identity.description);
    expect(screen.queryByText("brand-internal")).toBeNull();
    expect(screen.queryByLabelText("Brand Brain JSON")).toBeNull();
  });
  it("updates a single field while preserving approval metadata and other fields", () => {
    const onChange = vi.fn();
    render(<BrandBrainProfile brain={brain} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Business description"), { target: { value: "Beverage distribution" } });
    expect(onChange).toHaveBeenCalledWith({
      ...brain, identity: { description: "Beverage distribution" },
    });
    expect(updateField(brain, "commercial", "primary_cta", "Request a trade account").metadata).toEqual(brain.metadata);
  });
});
