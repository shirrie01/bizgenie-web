import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();

vi.mock("../session", () => ({
  getCustomerSession: (...args) => getCustomerSessionMock(...args),
  refreshCustomerSession: vi.fn(),
}));

vi.mock("../authClient", () => ({
  onAuthStateChange: vi.fn(() => () => {}),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
}));

const session = {
  status: "ready",
  accessToken: "customer-token",
  tenantId: "tenant-1",
  projectId: "project-1",
  brandId: "brand-1",
};

const recommendation = {
  recommendation_id: "11111111-1111-4111-8111-111111111111",
  tenant_id: "tenant-1",
  project_id: "project-1",
  brand_id: "brand-1",
  campaign_name: "Audi A3 Offer Campaign",
  explanation: "Recommended because this is the first safe campaign shape.",
  create_campaign_payload: {
    tenant_id: "tenant-1",
    project_id: "project-1",
    brand_id: "brand-1",
    name: "Audi A3 Offer Campaign",
    goal: "Promote the Audi A3 offer",
    display_timezone: "Europe/London",
  },
  suggested_items: [
    { name: "Offer announcement", format: "text", platform: "instagram", placement: "feed", destination_label: "Instagram", reason: "Start with the offer." },
    { name: "Facebook reminder", format: "text", platform: "facebook", placement: "feed", destination_label: "Facebook", reason: "Repeat the offer." },
    { name: "Customer email", format: "text", platform: "email", placement: "message", destination_label: "Email", reason: "Reach existing customers." },
  ],
};

function campaign(version, itemCount) {
  return {
    result: { campaign_id: "22222222-2222-4222-8222-222222222222", campaign_version: version, created_ids: {} },
    campaign: {
      campaign_id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "tenant-1",
      project_id: "project-1",
      brand_id: "brand-1",
      name: "Audi A3 Offer Campaign",
      goal: "Promote the Audi A3 offer",
      display_timezone: "Europe/London",
      version,
      items: recommendation.suggested_items.slice(0, itemCount).map((item, index) => ({
        content_item_id: `33333333-3333-4333-8333-33333333333${index}`,
        name: item.name,
        format: item.format,
        variants: [{
          variant_id: `44444444-4444-4444-8444-44444444444${index}`,
          destination_label: item.destination_label,
          workflow: "draft",
        }],
      })),
    },
  };
}

beforeEach(() => {
  getCustomerSessionMock.mockReset();
  getCustomerSessionMock.mockResolvedValue(session);
  global.fetch = vi.fn();
});

describe("recommendation-to-campaign creation", () => {
  it("creates the durable campaign and recommendation items with auth, stable idempotency and version chaining", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(4, 3) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));

    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(5));

    const [createUrl, createOptions] = global.fetch.mock.calls[1];
    expect(createUrl).toContain("/customer/campaigns");
    expect(createOptions.headers.authorization).toBe("Bearer customer-token");
    const createBody = JSON.parse(createOptions.body);
    expect(createBody).toMatchObject({
      tenant_id: "tenant-1",
      project_id: "project-1",
      brand_id: "brand-1",
      name: "Audi A3 Offer Campaign",
      display_timezone: "Europe/London",
      idempotency_key: "rec:11111111-1111-4111-8111-111111111111:campaign",
    });

    for (let index = 0; index < 3; index += 1) {
      const [url, options] = global.fetch.mock.calls[index + 2];
      expect(url).toContain("/customer/campaigns/22222222-2222-4222-8222-222222222222/content-items");
      expect(options.headers.authorization).toBe("Bearer customer-token");
      const body = JSON.parse(options.body);
      expect(body.expected_campaign_version).toBe(index + 1);
      expect(body.idempotency_key).toBe(`rec:11111111-1111-4111-8111-111111111111:item:${index + 1}`);
      expect(body.name).toBe(recommendation.suggested_items[index].name);
    }

    expect(await screen.findByText(/saved to your workspace/i)).toBeInTheDocument();
    expect(screen.getAllByText("Offer announcement").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /campaign created/i })).toBeDisabled();
    expect(screen.getByText(/nothing has been scheduled or published/i)).toBeInTheDocument();
  });
});
