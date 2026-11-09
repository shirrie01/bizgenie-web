import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
// user-event is not a dependency of this project; fireEvent with a controlled-input shim is enough here.
const userEvent = {
  click: async (el) => { await act(async () => { fireEvent.click(el); }); },
  type: async (el, text) => { await act(async () => { fireEvent.change(el, { target: { value: text } }); }); },
  tab: async () => { await act(async () => { const a = document.activeElement; if (a && a !== document.body) fireEvent.blur(a); }); },
};
import GrowthCentre from "./GrowthCentre";
import { buildWorkspaceModel } from "./workspaceModel";
import { recommendation, snapshotAvailable, snapshotStale } from "../intel/fixtures";

const scope = { tenantId: "t1", projectId: "p1", brandId: "b1" };
const model = (over = {}) => buildWorkspaceModel({ draft: { goal: "Get listed with more wholesale accounts", industryText: "craft drinks brewery", audience: "Independent bars", cta: "Request a trade sample" }, goal: "Get listed with more wholesale accounts", channels: ["LinkedIn"], campaigns: [{ campaign_id: "c1", name: "Trade push", updated_at: "2026-10-20T00:00:00Z" }], ...over });
const mount = (props = {}) => render(<GrowthCentre model={model()} scope={scope} isOwner campaignList={{ status: "ready", campaigns: [] }} workspaceCalendarState={{ status: "idle", entries: [] }} onGo={vi.fn()} onOpenCampaign={vi.fn()} {...props} />);

describe("Growth Control Centre", () => {
  it("shows the five-step hierarchy and does not invent results when analytics is off", () => {
    mount();
    for (const h of [/1\. Your objective/, /2\. Current performance/, /3\. Content pipeline/, /4\. Experiments/, /5\. Recommended next actions/]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(screen.getByText(/No platform results are available yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+%|synthetic|sample data/i);
  });
  it("links a campaign to Campaign Studio", async () => {
    const open = vi.fn(); mount({ onOpenCampaign: open });
    await userEvent.click(screen.getByRole("button", { name: "Trade push" })); expect(open).toHaveBeenCalledWith("c1");
  });
  it("shows platform-measured rows only from a valid snapshot, with freshness and provenance", () => {
    mount({ analyticsEnabled: true, snapshot: snapshotAvailable() });
    expect(screen.getByText(/Measured by the platform/)).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /TikTok · Organic/ })).toBeInTheDocument();
  });
  it("says so when platform data is stale or missing, and refuses a malformed body", () => {
    const { unmount } = mount({ analyticsEnabled: true, snapshot: snapshotStale() });
    expect(screen.getByText(/too old to use/)).toBeInTheDocument(); unmount();
    mount({ analyticsEnabled: true, snapshot: { contract_version: "nope" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/);
  });
  it("describes a recommendation as an observed change that needs acceptance, never a cause", () => {
    mount({ analyticsEnabled: true, recommendations: [recommendation(), recommendation({ causal_claim: true })] });
    expect(screen.getAllByText(/observed change only/)).toHaveLength(1);
    expect(screen.getByText(/Nothing changes unless you accept it/)).toBeInTheDocument();
  });
  it("reads a wholesale beverage goal as distributor acquisition in the strategy tab", async () => {
    mount({ model: model() });
    await userEvent.click(screen.getByRole("button", { name: "Strategy" }));
    await userEvent.click(screen.getByRole("button", { name: /Use Distributor or wholesale acquisition/ }));
    expect(screen.getByText("Independent bars")).toBeInTheDocument();
    expect(screen.getByText("BizGenie does not forecast results.")).toBeInTheDocument();
  });
  it("plans an experiment, keeps it on this device and says it is only planned", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Experiments" }));
    await userEvent.click(screen.getByRole("button", { name: "Add experiment" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/expect to happen/);
    await userEvent.type(screen.getByLabelText(/What do you expect/), "A question hook will get more clicks");
    await userEvent.type(screen.getByLabelText(/Variant A/), "Tired of slow quotes?"); await userEvent.type(screen.getByLabelText(/Variant B/), "Quotes in a day.");
    await userEvent.click(screen.getByRole("button", { name: "Add experiment" }));
    expect(within(document.body).getByText("Experiment planned")).toBeInTheDocument();
    expect(screen.getByText(/stays at “planned”/)).toBeInTheDocument();
    expect(screen.getAllByText(/Saved on this device only/).length).toBeGreaterThan(0);
  });
  it("read-only members can read but not plan", async () => {
    mount({ readOnly: true, isOwner: false });
    await userEvent.click(screen.getByRole("button", { name: "Experiments" }));
    expect(screen.queryByRole("button", { name: "Add experiment" })).toBeNull();
  });
  it("product details: extraction is off, facts start unapproved, only the owner can approve", async () => {
    const { unmount } = mount();
    await userEvent.click(screen.getByRole("button", { name: "Product details" }));
    expect(screen.getByRole("button", { name: "Read my website" })).toBeDisabled();
    { const f = screen.getByLabelText("What you sell and what you are offering"); await userEvent.type(f, "Free fitting"); await act(async () => { fireEvent.blur(f); }); }
    expect(screen.getByText("Provided by you")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve" })); expect(screen.getByText("Approved by you")).toBeInTheDocument();
    unmount();
  });
  it("reference ideas: needs rights confirmation and says what was analysed", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Creative ideas" }));
    await userEvent.type(screen.getByLabelText("Describe the style or idea"), "A quick question then a demonstration, in the style of Acme Fizz");
    await userEvent.click(screen.getByRole("button", { name: "Create original directions" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Confirm you may use/);
    await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Create original directions" }));
    expect(screen.getByText(/BizGenie has not seen the ad itself/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Brief for Direction/)).toHaveLength(3);
    for (const b of screen.getAllByLabelText(/Brief for Direction/)) expect(b.value).not.toMatch(/Acme Fizz/); // the customer's own box may still show what they typed; the briefs may not
  });
});
