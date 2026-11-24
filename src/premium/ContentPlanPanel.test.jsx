import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ContentPlanPanel from "./ContentPlanPanel";
import { FONZO_PLAN, FONZO_PLAN_NEXT_WEEK } from "../test/fonzoPlanFixture";

const open = () => { const d = document.querySelector("details"); d.open = true; };
describe("ContentPlanPanel", () => {
  it("starts empty, asks for a start date and promises nothing is created yet", () => {
    const onLoad = vi.fn();
    render(<ContentPlanPanel state={{ status: "idle", plan: null, error: "" }} onLoad={onLoad} onAdd={vi.fn()} />); open();
    expect(screen.getByText(/Nothing is created, generated, priced or scheduled until you choose to/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First day of the week"), { target: { value: "2026-12-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Build my plan" }));
    expect(onLoad).toHaveBeenCalledWith("2026-12-07");
  });
  it("shows the plan with counts, times, calls to action, assumptions and placeholders, and offers one explicit add action", () => {
    const onAdd = vi.fn();
    render(<ContentPlanPanel state={{ status: "ready", plan: FONZO_PLAN, error: "", existingNames: [] }} onLoad={vi.fn()} onAdd={onAdd} />); open();
    expect(screen.getByText(/7 posts/)).toBeTruthy();
    expect(screen.getByText(/5 × image, 3 × video/)).toBeTruthy();
    expect(screen.getByRole("table", { name: /Seven-day plan, week of 2026-12-07 \(Europe\/London\)/ })).toBeTruthy();
    expect(screen.getByText("Day 1 · Meet the brand (Instagram image)")).toBeTruthy(); // short display name; the saved name carries the week
    expect(screen.getAllByText("Enquire about stocking Fonzo").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/Please confirm before publishing/)).toBeTruthy();
    expect(screen.getByText(/Enquiry destination/)).toBeTruthy();
    expect(screen.getByText(/Placeholders:/)).toBeTruthy();
    expect(screen.getByText(/exact price for each item is shown before you confirm it/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add 8 items to this campaign as drafts" }));
    expect(onAdd).toHaveBeenCalledWith(FONZO_PLAN);
  });
  it("marks present items, disables the button when everything is added, and shows failures with a continue action", () => {
    const names = FONZO_PLAN.items.map((i) => i.content_item.name);
    const { rerender } = render(<ContentPlanPanel state={{ status: "ready", plan: FONZO_PLAN, error: "", existingNames: names.slice(0, 3), failed: true }} onLoad={vi.fn()} onAdd={vi.fn()} />); open();
    expect(screen.getByRole("button", { name: "Continue adding 5 items" })).toBeTruthy();
    rerender(<ContentPlanPanel state={{ status: "ready", plan: FONZO_PLAN, error: "That item could not be added. 3 of 8 items are in your campaign; nothing already added was lost.", existingNames: names.slice(0, 3), failed: true }} onLoad={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toMatch(/nothing already added was lost/);
    rerender(<ContentPlanPanel state={{ status: "added", plan: FONZO_PLAN, error: "", existingNames: names, message: "8 items added as drafts. Nothing has been generated, priced, approved or scheduled yet." }} onLoad={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "All plan items are in this campaign" }).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/Nothing has been generated/);
  });
  it("after week one is added, a rebuilt next-week plan offers all eight items again (nothing is shown as already added)", () => {
    const week1Names = FONZO_PLAN.items.map((i) => i.content_item.name);
    render(<ContentPlanPanel state={{ status: "ready", plan: FONZO_PLAN_NEXT_WEEK, error: "", existingNames: week1Names }} onLoad={vi.fn()} onAdd={vi.fn()} />); open();
    expect(screen.getByRole("table", { name: /week of 2026-12-14/ })).toBeTruthy();
    expect(screen.queryByText(/· added/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add 8 items to this campaign as drafts" })).toBeTruthy();
  });
});
