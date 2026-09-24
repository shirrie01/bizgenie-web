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
  it("loads and saves only the selected Brand Brain without sending trusted scope IDs", async () => {
    const brain = {
      brand_id: "brand-1",
      project_id: "project-1",
      name: "Lease Expert",
      identity: { positioning: "Founder approved" },
      metadata: { version: 3, status: "approved", created_at: "2026-09-24T00:00:00.000Z", updated_at: "2026-09-24T00:00:00.000Z" },
    };
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", brand_brain: brain }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", brand_brain: { ...brain, metadata: { ...brain.metadata, version: 4 } } }) });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /review brand brain/i }));
    await screen.findByDisplayValue(/"Lease Expert"/);
    const [readUrl, readOptions] = global.fetch.mock.calls[0];
    expect(readUrl).toContain("/customer/workspace/brand-brain");
    expect(readOptions.headers.authorization).toBe("Bearer customer-token");

    fireEvent.click(screen.getByRole("button", { name: /save brand brain changes/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [saveUrl, saveOptions] = global.fetch.mock.calls[1];
    expect(saveUrl).toContain("/customer/workspace/brand-brain");
    expect(saveOptions.method).toBe("PUT");
    const body = JSON.parse(saveOptions.body);
    expect(body.brand_id).toBeUndefined();
    expect(body.project_id).toBeUndefined();
    expect(body.metadata).toBeUndefined();
    expect(body.name).toBe("Lease Expert");
  });

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

  it("generates one eligible draft variant with scoped versioned idempotency and renders persisted review state", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    generated.campaign.items[0].variants[0].workflow = "review";
    generated.campaign.items[0].variants[0].current_content = "Persisted generated copy";
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ generation_id: "gen-1", campaign: generated.campaign }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);

    await screen.findByText("Persisted generated copy");
    expect(screen.getByText(/ready for review/i)).toBeInTheDocument();
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain("/customer/campaigns/22222222-2222-4222-8222-222222222222/variants/");
    expect(options.headers.authorization).toBe("Bearer customer-token");
    expect(JSON.parse(options.body)).toMatchObject({
      tenant_id: "tenant-1",
      project_id: "project-1",
      expected_campaign_version: 4,
      idempotency_key: "campaign:22222222-2222-4222-8222-222222222222:variant:44444444-4444-4444-8444-444444444440:version:4:generate",
      execution_mode: "ai",
    });
  });

  it("sends a bounded temporary execution brief without changing Brand Brain scope", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    generated.campaign.items[0].variants[0].workflow = "review";
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ generation_id: "gen-brief", campaign: generated.campaign }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.change(screen.getByLabelText(/execution brief/i), { target: { value: "Open with a founder-led explanation." } });
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await waitFor(() => expect(global.fetch.mock.calls.filter(([url]) => url.includes("/generate")).length).toBe(1));
    const body = JSON.parse(global.fetch.mock.calls.at(-1)[1].body);
    expect(body).toMatchObject({ execution_mode: "ai", execution_brief: "Open with a founder-led explanation." });
    expect(body.brand_id).toBeUndefined();
    expect(screen.getByRole("option", { name: /Hybrid/i })).toBeDisabled();
  });

  it("prevents double-click generation and does not claim success on backend failure", async () => {
    const saved = campaign(4, 3);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: false, status: 409 });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    const generate = screen.getAllByRole("button", { name: /generate draft/i })[0];
    fireEvent.click(generate);
    fireEvent.click(generate);
    await screen.findByText(/could not be generated yet/i);
    expect(global.fetch.mock.calls.filter(([url]) => url.includes("/generate")).length).toBe(1);
    expect(screen.queryByText(/ready for review/i)).not.toBeInTheDocument();
  });

  it("does not expose generation for a non-draft variant", async () => {
    const saved = campaign(4, 3);
    saved.campaign.items.forEach((item) => {
      item.variants[0].workflow = "review";
    });
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    expect(screen.queryByRole("button", { name: /generate draft/i })).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.filter(([url]) => url.includes("/generate")).length).toBe(0);
  });

  it("loads only backend-authoritative campaign calendar activity", async () => {
    const saved = campaign(4, 3);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: [{ campaign_id: saved.campaign.campaign_id, content_item_id: saved.campaign.items[0].content_item_id, variant_id: saved.campaign.items[0].variants[0].variant_id, workflow: "published", occurrence_at: "2026-09-20T12:00:00.000Z" }] }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getByRole("button", { name: /view campaign calendar/i }));

    expect(await screen.findByLabelText(/campaign calendar/i)).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain("/customer/campaigns/22222222-2222-4222-8222-222222222222/calendar?");
    expect(url).toContain("tenant_id=tenant-1");
    expect(url).toContain("project_id=project-1");
    expect(url).toContain("from=");
    expect(url).toContain("to=");
    expect(options.headers.authorization).toBe("Bearer customer-token");
  });

  it("shows only backend-authoritative measured results with truthful provenance", async () => {
    const saved = campaign(4, 3);
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ measurements: [{ measurement_id: "measurement-1", campaign_id: saved.campaign.campaign_id, variant_id: saved.campaign.items[0].variants[0].variant_id, metric: "views", value: 1250, unit: "count", observed_at: "2026-09-20T14:00:00.000Z", evidence_kind: "customer_attestation" }] }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getByRole("button", { name: /view campaign results/i }));

    expect(await screen.findByLabelText(/campaign results/i)).toBeInTheDocument();
    expect(screen.getByText(/1250 count/)).toBeInTheDocument();
    expect(screen.getByText(/customer attestation/i)).toBeInTheDocument();
    const [url, options] = global.fetch.mock.calls.at(-1);
    expect(url).toContain("/customer/campaigns/22222222-2222-4222-8222-222222222222/measurements?");
    expect(url).toContain("tenant_id=tenant-1");
    expect(url).toContain("project_id=project-1");
    expect(options.headers.authorization).toBe("Bearer customer-token");
  });

  it("chains preview receipt, acknowledgement projection, and backend-authoritative approval", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    const variant = generated.campaign.items[0].variants[0];
    variant.workflow = "review";
    variant.current_revision_id = "revision-1";
    variant.current_content = "Server persisted review copy";
    const acknowledged = JSON.parse(JSON.stringify(generated));
    acknowledged.campaign.version = 5;
    acknowledged.campaign.items[0].variants[0].workflow = "review";
    const approved = JSON.parse(JSON.stringify(acknowledged));
    approved.campaign.version = 6;
    approved.campaign.items[0].variants[0].workflow = "approved";

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: generated.campaign }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: { render_receipt_id: "receipt-1", revision_id: "revision-1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: acknowledged.campaign, result: { created_ids: { preview_ids: ["preview-1"] } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: approved.campaign }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");
    fireEvent.click(screen.getByRole("button", { name: /render preview/i }));
    await screen.findByRole("button", { name: /acknowledge preview/i });
    const previewBody = JSON.parse(global.fetch.mock.calls[6][1].body);
    expect(previewBody).toMatchObject({ tenant_id: "tenant-1", project_id: "project-1", revision_id: "revision-1" });
    fireEvent.click(screen.getByRole("button", { name: /acknowledge preview/i }));
    await screen.findByRole("button", { name: /^approve$/i });
    const ackBody = JSON.parse(global.fetch.mock.calls[7][1].body);
    expect(ackBody).toMatchObject({ expected_campaign_version: 4, revision_id: "revision-1", render_receipt_id: "receipt-1", acknowledged: true });
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
    const approvalBody = JSON.parse(global.fetch.mock.calls[8][1].body);
    expect(approvalBody).toMatchObject({ expected_campaign_version: 5, revision_id: "revision-1", preview_id: "preview-1", approved: true });
  });
});
