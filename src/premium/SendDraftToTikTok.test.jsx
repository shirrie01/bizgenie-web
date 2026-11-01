// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SendDraftToTikTok from "./SendDraftToTikTok";
import AddCreativeItem from "./AddCreativeItem";

afterEach(cleanup);
const CONN = "0b0e5b8e-6f3a-4c1f-8f0a-1d2c3b4a5f60", SCHED = "5d1e8a7c-3b2a-4f9e-9c1d-7a6b5c4d3e2f";
const campaign = { campaign_id: "k1", version: 7, display_timezone: "UTC", schedules: [{ schedule_id: SCHED, variant_id: "v1", status: "active", scheduled_for: "2026-11-03T10:00:00Z", timezone: "UTC", local_datetime: "2026-11-03T10:00:00", utc_offset_minutes: 0 }] };
const variant = (o = {}) => ({ variant_id: "v1", platform: "tiktok", workflow: "scheduled", destination_key: CONN, active_schedule_id: SCHED, ...o });
const props = (o = {}) => ({ campaign, variant: variant(), session: { accessToken: "tok" }, scope: { tenantId: "t", projectId: "p", brandId: "b" }, isOwner: true, apiBaseUrl: "https://api.test", ...o });

describe("SendDraftToTikTok (BG-LAUNCH-006)", () => {
  it("is shown only to the owner, for a scheduled TikTok item created for a connected account", () => {
    const hidden = [{ isOwner: false }, { variant: variant({ platform: "instagram" }) }, { variant: variant({ workflow: "approved" }) }, { variant: variant({ destination_key: undefined }) }];
    for (const o of hidden) { const { container, unmount } = render(<SendDraftToTikTok {...props(o)} />); expect(container).toBeEmptyDOMElement(); unmount(); }
    render(<SendDraftToTikTok {...props()} />); expect(screen.getByRole("group", { name: /send to tiktok as a draft/i })).toBeInTheDocument();
  });
  it("says before anything happens that it is a draft the creator must post themselves, and needs an explicit confirmation", () => {
    const enqueue = vi.fn(); render(<SendDraftToTikTok {...props({ api: { enqueueDispatch: enqueue } })} />);
    expect(screen.getByText(/BizGenie does not publish it/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /send as a draft/i }); expect(button).toBeDisabled(); fireEvent.click(button); expect(enqueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); expect(button).toBeEnabled();
  });
  it("queues exactly the connection, schedule and campaign version it was created for, then says Draft, never Published", async () => {
    const enqueue = vi.fn().mockResolvedValue({ state: "queued" }); render(<SendDraftToTikTok {...props({ api: { enqueueDispatch: enqueue } })} />);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /send as a draft/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Queued/));
    expect(enqueue).toHaveBeenCalledTimes(1); expect(enqueue.mock.calls[0][0]).toMatchObject({ connectionId: CONN, scheduleId: SCHED, campaignId: "k1", variantId: "v1", expectedCampaignVersion: 7, accessToken: "tok" });
    expect(screen.getByRole("status")).toHaveTextContent(/Draft sent to TikTok/); expect(screen.getByRole("status")).not.toHaveTextContent(/is published/i);
    expect(screen.queryByRole("button", { name: /send as a draft/i })).toBeNull(); // cannot be queued twice from here
  });
  it("explains refusals plainly and never claims it was uploaded", async () => {
    const enqueue = vi.fn().mockRejectedValue(Object.assign(new Error("raw"), { code: "DESTINATION_NOT_APPROVED" })); render(<SendDraftToTikTok {...props({ api: { enqueueDispatch: enqueue } })} />);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /send as a draft/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not created for a connected TikTok account/i);
  });
  it("an unconfirmed result tells the owner to check before retrying", async () => {
    const enqueue = vi.fn().mockRejectedValue(Object.assign(new Error("net"), { kind: "unconfirmed" })); render(<SendDraftToTikTok {...props({ api: { enqueueDispatch: enqueue } })} />);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /send as a draft/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not confirm whether this was queued/i);
  });
});

describe("AddCreativeItem connected account (BG-LAUNCH-006)", () => {
  const conns = [{ id: CONN, provider: "tiktok", name: "Test Creator", status: "connected" }, { id: "c2", provider: "tiktok", name: "Old", status: "needs_reauth" }, { id: "c3", provider: "instagram", name: "IG", status: "connected" }];
  it("offers only connected accounts for the chosen platform and passes the choice as the destination key", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true }); const load = vi.fn().mockResolvedValue(conns);
    render(<AddCreativeItem onAdd={onAdd} loadConnections={load} />);
    fireEvent.click(screen.getByText(/add an image or video/i)); expect(screen.queryByLabelText("Connected account")).toBeNull(); // instagram default: its connection is not offered until chosen
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "tiktok" } });
    const select = await screen.findByLabelText("Connected account"); expect([...select.options].map((o) => o.textContent)).toEqual(["None: I will publish it myself", "Test Creator"]);
    fireEvent.change(select, { target: { value: CONN } }); expect(screen.getByLabelText("Account or page")).toHaveValue("Test Creator");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reel" } }); fireEvent.click(screen.getByRole("button", { name: /add to the campaign/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled()); expect(onAdd.mock.calls[0][0]).toMatchObject({ platform: "tiktok", destinationKey: CONN });
  });
  it("without a choice, or without connections, the item has no destination key and nothing else changes", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true }); render(<AddCreativeItem onAdd={onAdd} loadConnections={async () => { throw new Error("down"); }} />);
    fireEvent.click(screen.getByText(/add an image or video/i)); fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reel" } }); fireEvent.change(screen.getByLabelText("Account or page"), { target: { value: "Page" } });
    fireEvent.click(screen.getByRole("button", { name: /add to the campaign/i })); await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0].destinationKey).toBeNull(); expect(screen.queryByLabelText("Connected account")).toBeNull();
  });
});
