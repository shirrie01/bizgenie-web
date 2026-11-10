import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PremiumWorkspaceCalendar from "./PremiumWorkspaceCalendar";
import { windowFor } from "./workspaceCalendarModel";

afterEach(cleanup);
const NOW = new Date("2026-10-25T12:00:00.000Z");
const mk = (over) => ({ key: `${over.campaignId}:${over.variantId}`, contentName: "Offer", platform: "instagram", placement: "feed", destinationLabel: "Instagram", workflow: "scheduled", occurrenceAt: null, ...over });
const ITEMS = [
  mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "v1", occurrenceAt: "2026-10-27T10:00:00.000Z" }),
  mk({ campaignId: "c2", campaignName: "Autumn offer", variantId: "v2", contentName: "Clash twin", occurrenceAt: "2026-10-27T10:00:00.000Z" }),
  mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "v3", contentName: "Newsletter", platform: "email", placement: "newsletter", destinationLabel: "Email", workflow: "published", occurrenceAt: "2026-10-29T08:30:00.000Z" }),
  mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "v4", contentName: "Idea", workflow: "draft" }),
];
const READY = { status: "ready", items: ITEMS, failures: [], error: "", window: windowFor("2026-10-25"), campaignsRead: 2, campaignsChosen: 2, campaignsTotal: 2, truncated: false };
const show = (state = READY, onLoad = vi.fn()) => { render(<PremiumWorkspaceCalendar state={state} onLoad={onLoad} tz="UTC" now={NOW} />); return onLoad; };

describe("workspace calendar", () => {
  it("states what it covers, in which time zone, and that BizGenie does not publish", () => {
    show();
    expect(screen.getByRole("heading", { name: /calendar · all campaigns/i })).toBeInTheDocument();
    expect(screen.getByText(/it does not publish for you\. times are shown in UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/read 2 of 2 campaigns for thu, 24 september 2026 to sun, 8 november 2026/i)).toBeInTheDocument();
  });

  it("month grid: an accessible table with a caption, weekday headers, and each item on its own day with campaign, channel and status as text", () => {
    show();
    const table = screen.getByRole("table");
    expect(within(table).getByText("October 2026", { selector: "caption" })).toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    const cell = within(table).getByText(/tuesday, 27 october 2026/i).closest("td");
    expect(within(cell).getAllByRole("listitem")).toHaveLength(2);
    expect(within(cell).getByText(/spring leasing · instagram · feed/i)).toBeInTheDocument();
    expect(within(cell).getAllByText("Scheduled")).toHaveLength(2);
    expect(within(table).getByText(/thursday, 29 october 2026/i).closest("td")).toHaveTextContent("Published");
    expect(within(table).getByText(/sunday, 25 october 2026, today/i)).toBeInTheDocument();
  });

  it("flags a possible clash in words, only for scheduled items sharing destination and minute", () => {
    show();
    expect(screen.getAllByText(/possible clash: another scheduled item has the same destination and time/i)).toHaveLength(2);
  });

  it("lists items with no date separately and never places them on a day", () => {
    show();
    const group = screen.getByText(/not yet scheduled \(1\)/i).closest("details");
    expect(within(group).getByText("Idea")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("Idea")).toBeNull();
  });

  it("week and day views, with Previous/Today/Next, announce their range and keep to the same data", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(screen.getByRole("button", { name: "Week", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /week of mon, 19 october 2026 to sun, 25 october 2026/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next week/i }));
    expect(screen.getByRole("heading", { name: /week of mon, 26 october 2026 to sun, 1 november 2026/i })).toBeInTheDocument();
    expect(screen.getAllByText("Scheduled").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.getByText(/no scheduled or published activity in this day/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next day/i })); fireEvent.click(screen.getByRole("button", { name: /next day/i }));
    expect(within(screen.getByRole("list", { name: /tuesday, 27 october 2026/i })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("filters by campaign, channel and status, and says when a filter leaves nothing", () => {
    show();
    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "c2" } });
    expect(within(screen.getByRole("table")).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Campaign"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "email" } });
    expect(within(screen.getByRole("table")).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "draft" } });
    expect(screen.getByText(/no scheduled or published activity in this month for these filters/i)).toBeInTheDocument();
  });

  it("an unloaded period is not shown as empty: it offers to load it, as the customer's choice", () => {
    const onLoad = show();
    fireEvent.click(screen.getByRole("button", { name: /next month/i })); fireEvent.click(screen.getByRole("button", { name: /next month/i })); // December
    expect(screen.getByText(/this period has not been loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/no scheduled or published activity in this month/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /load this period/i }));
    expect(onLoad).toHaveBeenCalledWith(windowFor("2026-12-25"));
  });

  it("Refresh is the customer's choice and re-requests the current window", () => {
    const onLoad = show();
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
    expect(onLoad).toHaveBeenCalledWith(READY.window);
  });

  it("says plainly that more campaigns have not been read and offers the next batch; a failed campaign is named", () => {
    const onLoad = show({ ...READY, truncated: true, campaignsChosen: 8, campaignsTotal: 15, campaignsRead: 7, nextOffset: 8, failures: [{ campaignId: "c9", campaignName: "Broken campaign", status: 500 }] });
    expect(screen.getByText(/7 more campaigns have not been read yet/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not read: broken campaign/i);
    fireEvent.click(screen.getByRole("button", { name: /load the next 7 campaigns/i }));
    expect(onLoad).toHaveBeenCalledWith(READY.window, { more: true });
  });

  it("when everything has been read there is no 'load more', and a failed extra batch keeps what is shown and says so", () => {
    show();
    expect(screen.queryByRole("button", { name: /load the next/i })).toBeNull();
    cleanup();
    show({ ...READY, truncated: true, campaignsChosen: 8, campaignsTotal: 12, nextOffset: 8, moreError: "The calendar could not be loaded yet." });
    expect(screen.getByText(/campaigns already shown are unchanged/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("each item can be opened in its campaign, by name, and nothing is offered when no handler exists", () => {
    const onOpenCampaign = vi.fn();
    render(<PremiumWorkspaceCalendar state={READY} onLoad={vi.fn()} onOpenCampaign={onOpenCampaign} tz="UTC" now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: /open campaign autumn offer: clash twin/i }));
    expect(onOpenCampaign).toHaveBeenCalledWith("c2");
    cleanup();
    show();
    expect(screen.queryByRole("button", { name: /open campaign/i })).toBeNull();
  });

  it("an API-sourced calendar says it covers all campaigns", () => {
    show({ ...READY, source: "api" });
    expect(screen.getByText(/from all your campaigns/i)).toBeInTheDocument();
  });


  it("no campaigns: says so and offers no invented activity", () => {
    show({ ...READY, items: [], campaignsRead: 0, campaignsChosen: 0, campaignsTotal: 0 });
    expect(screen.getByText(/create a campaign to see its calendar/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("loading and error states are announced and recoverable", () => {
    const onLoad = vi.fn();
    const { rerender } = render(<PremiumWorkspaceCalendar state={{ ...READY, status: "loading" }} onLoad={onLoad} tz="UTC" now={NOW} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading your campaigns/i);
    rerender(<PremiumWorkspaceCalendar state={{ ...READY, status: "error", error: "The calendar could not be loaded yet." }} onLoad={onLoad} tz="UTC" now={NOW} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded yet/i);
    fireEvent.click(screen.getByRole("button", { name: /^try again$/i }));
    expect(onLoad).toHaveBeenCalled();
  });
  it("published entries say who vouches for them; scheduled entries show their delivery status; a failed overlay is stated, not hidden", () => {
    const items = [
      mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "p1", contentName: "Platform post", workflow: "published", occurrenceKind: "published", platformVerified: true, occurrenceAt: "2026-10-28T09:00:00.000Z" }),
      mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "p2", contentName: "Manual post", workflow: "published", occurrenceKind: "published", platformVerified: false, occurrenceAt: "2026-10-28T10:00:00.000Z" }),
      mk({ campaignId: "c1", campaignName: "Spring leasing", variantId: "p3", contentName: "Queued post", occurrenceKind: "scheduled", occurrenceAt: "2026-10-28T11:00:00.000Z", delivery: { state: "queued", label: "Queued to send at the planned time" } }),
    ];
    show({ ...READY, items, overlay: { ok: false, dropped: 0 } });
    expect(screen.getByText("Confirmed by the platform")).toBeInTheDocument(); expect(screen.getByText(/Recorded by you; not checked with the platform/)).toBeInTheDocument(); expect(screen.getByText(/Queued to send at the planned time\./)).toBeInTheDocument();
    expect(screen.getByText(/Delivery status could not be loaded, so scheduled items show their planned time only/)).toBeInTheDocument();
  });
  it("unmatched delivery records are counted in words, not drawn", () => { show({ ...READY, overlay: { ok: true, dropped: 2 } }); expect(screen.getByText(/2 delivery records did not match a scheduled item and were left out/)).toBeInTheDocument(); });
});
