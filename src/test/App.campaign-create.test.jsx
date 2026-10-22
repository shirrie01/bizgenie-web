import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();

vi.mock("../billingClient", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    readCustomerBillingState: vi.fn().mockResolvedValue({
      status: "not_subscribed",
      subscription: null,
    }),
  };
});


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

// GET .../creative-preview is answered by URL so the existing ordered fetch queue only has to describe
// the other calls. `creativeCopy`, `creativeMedia` and `creativeHandler` can be overridden per test.
let creativeCopy;
let creativeMedia;
let creativeHandler;
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const isCreativeUrl = (url) => typeof url === "string" && url.includes("/creative-preview?");
const isMediaUrl = (url) => typeof url === "string" && /\/assets\/[^/]+\/preview\?/.test(url);
let mediaHandler;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const mediaResponse = (status = 200, { mime = "image/png", bytes = PNG, method = "GET" } = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers(status === 200 ? { "content-type": mime, "content-length": String(bytes.byteLength) } : {}),
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  json: async () => ({ error: { code: "X" } }),
});
const mediaCalls = () => global.fetch.mock.calls.filter(([url]) => isMediaUrl(url));
const apiCalls = () => global.fetch.mock.calls.filter(([url]) => !isCreativeUrl(url) && !isMediaUrl(url));
const creativeCalls = () => global.fetch.mock.calls.filter(([url]) => isCreativeUrl(url));
function defaultCreativeHandler(url) {
  const u = new URL(url);
  const parts = u.pathname.split("/");
  return ok({ preview: {
    contract_version: "campaign-creative-preview.v1", campaign_id: parts[3], campaign_version: Number(u.searchParams.get("expected_campaign_version")),
    content_item_id: "33333333-3333-4333-8333-333333333330", variant_id: parts[5], revision_id: u.searchParams.get("revision_id"), revision_number: 1,
    platform: "instagram", placement: "feed", content_type: "text", workflow: "review", content_status: creativeMedia.length ? "unavailable" : "available",
    copy_status: Object.values(creativeCopy).some(Boolean) ? "available" : "unavailable", copy: creativeCopy, media: creativeMedia,
    provenance: { source: "persisted_revision", revision_source: "manual", created_at: "2026-10-22T09:00:00.000Z" },
    approval_status: "not_approved", platform_preview: { status: "unrendered", artifact_url: null, reason: "NO_PERSISTED_PLATFORM_ARTIFACT" },
    acknowledgement_status: "not_acknowledged", read_only: true,
  } });
}

beforeEach(() => {
  getCustomerSessionMock.mockReset();
  getCustomerSessionMock.mockResolvedValue(session);
  creativeCopy = { title: null, body: "Server persisted review copy", caption: null, alt_text: null };
  creativeMedia = [];
  creativeHandler = defaultCreativeHandler;
  mediaHandler = (url, options) => mediaResponse(200, { method: options?.method });
  let blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  const queue = [];
  const fetchMock = vi.fn(async (url, options) => (isCreativeUrl(url) ? creativeHandler(url, options) : isMediaUrl(url) ? mediaHandler(url, options) : queue.shift()));
  fetchMock.mockResolvedValueOnce = (value) => { queue.push(value); return fetchMock; };
  global.fetch = fetchMock;
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
    await screen.findByDisplayValue("Lease Expert");
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
    generated.campaign.items[0].variants[0].current_revision_id = "revision-1";
    creativeCopy.body = "Persisted generated copy";
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
    const [url, options] = apiCalls().at(-1);
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
    const body = JSON.parse(apiCalls().at(-1)[1].body);
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
    const [url, options] = apiCalls().at(-1);
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
    const [url, options] = apiCalls().at(-1);
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
    const previewBody = JSON.parse(apiCalls()[6][1].body);
    expect(previewBody).toMatchObject({ tenant_id: "tenant-1", project_id: "project-1", revision_id: "revision-1" });
    fireEvent.click(screen.getByRole("button", { name: /acknowledge preview/i }));
    await screen.findByRole("button", { name: /^approve$/i });
    const ackBody = JSON.parse(apiCalls()[7][1].body);
    expect(ackBody).toMatchObject({ expected_campaign_version: 4, revision_id: "revision-1", render_receipt_id: "receipt-1", acknowledged: true });
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
    const approvalBody = JSON.parse(apiCalls()[8][1].body);
    expect(approvalBody).toMatchObject({ expected_campaign_version: 5, revision_id: "revision-1", preview_id: "preview-1", approved: true });
  });
  it("retries a failed acknowledgement without re-rendering and recovers from a failed preview", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    const variant = generated.campaign.items[0].variants[0];
    variant.workflow = "review";
    variant.current_revision_id = "revision-1";
    variant.current_content = "Server persisted review copy";
    const acknowledged = JSON.parse(JSON.stringify(generated));
    acknowledged.campaign.version = 5;

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: generated.campaign }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: { render_receipt_id: "receipt-1", revision_id: "revision-1" } }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: acknowledged.campaign, result: { created_ids: { preview_ids: ["preview-1"] } } }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");

    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/preview could not be rendered/i);
    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be acknowledged/i);
    fireEvent.click(screen.getByRole("button", { name: /^acknowledge preview$/i }));
    await screen.findByRole("button", { name: /^approve$/i });
    expect(global.fetch.mock.calls.filter(([url]) => url.includes("/preview-renders")).length).toBe(2);
    expect(global.fetch.mock.calls.filter(([url]) => url.includes("/preview-acknowledgements")).length).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("recovers from a stale campaign version by reloading, then acknowledges against the new version", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    const variant = generated.campaign.items[0].variants[0];
    variant.workflow = "review";
    variant.current_revision_id = "revision-1";
    variant.current_content = "Server persisted review copy";
    const latest = JSON.parse(JSON.stringify(generated));
    latest.campaign.version = 7;
    const acknowledged = JSON.parse(JSON.stringify(latest));
    acknowledged.campaign.version = 8;
    const receipt = { render_receipt_id: "receipt-1", revision_id: "revision-1", platform: "instagram", placement: "feed", format: "text", preview_digest: "abcdef0123456789" };

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: generated.campaign }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: receipt }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { code: "VERSION_CONFLICT" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: latest.campaign }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: receipt }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: acknowledged.campaign, result: { created_ids: { preview_ids: ["preview-1"] } } }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");

    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    expect(await screen.findByLabelText("Preview receipt")).toHaveTextContent("Instagram · Feed · Text");
    fireEvent.click(screen.getByRole("button", { name: /^acknowledge preview$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/campaign changed/i);
    expect(screen.queryByRole("button", { name: /^acknowledge preview$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /reload latest campaign/i }));
    const reloadUrl = await waitFor(() => {
      const hit = global.fetch.mock.calls.find(([url, options]) => !options?.method && url.includes("/customer/campaigns/22222222-2222-4222-8222-222222222222?"));
      expect(hit).toBeTruthy();
      return hit[0];
    });
    expect(reloadUrl).toContain("tenant_id=tenant-1");
    expect(reloadUrl).toContain("project_id=project-1");
    expect(await screen.findByRole("button", { name: /^render preview$/i })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    await screen.findByRole("button", { name: /^approve$/i });
    const ackCalls = global.fetch.mock.calls.filter(([url]) => url.includes("/preview-acknowledgements"));
    expect(ackCalls.map(([, o]) => JSON.parse(o.body).expected_campaign_version)).toEqual([4, 7]);
  });

  it("asks for a reload when approval cannot be confirmed instead of retrying with a changed version", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    const variant = generated.campaign.items[0].variants[0];
    variant.workflow = "review";
    variant.current_revision_id = "revision-1";
    variant.current_content = "Server persisted review copy";
    const acknowledged = JSON.parse(JSON.stringify(generated));
    acknowledged.campaign.version = 5;
    const unconfirmed = JSON.parse(JSON.stringify(acknowledged));
    unconfirmed.campaign.version = 6;

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
      .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
      .mockResolvedValueOnce({ ok: true, json: async () => saved })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: generated.campaign }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: { render_receipt_id: "receipt-1", revision_id: "revision-1" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: acknowledged.campaign, result: { created_ids: { preview_ids: ["preview-1"] } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: unconfirmed.campaign }) });

    render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
    await screen.findByText("Server persisted review copy");
    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reload the latest campaign/i);
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reload latest campaign/i })).toBeInTheDocument();
  });
  it("renders the real persisted content object (title, body, caption, alt text, asset reference) through review to approval", async () => {
    const saved = campaign(4, 3);
    const generated = JSON.parse(JSON.stringify(saved));
    const variant = generated.campaign.items[0].variants[0];
    variant.workflow = "review";
    variant.platform = "instagram";
    variant.placement = "feed";
    variant.current_revision_id = "revision-1";
    variant.current_content = { title: "Spring offer", body: "Book a free consultation this week.", caption: "Limited places.", alt_text: "An adviser at a desk", asset_refs: [{ asset_id: "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21", role: "primary" }] };
    const acknowledged = JSON.parse(JSON.stringify(generated));
    acknowledged.campaign.version = 5;
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

    creativeCopy = { title: "Spring offer", body: "Book a free consultation this week.", caption: "Limited places.", alt_text: "An adviser at a desk" };
    creativeMedia = [{ asset_id: "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21", role: "primary", media_kind: "image", mime_type: "image/png", source_kind: "generated", status: "unavailable", reason: "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE", url: null }];
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
    fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
    await screen.findByText("Audi A3 Offer Campaign");
    fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
    await screen.findByText(/saved to your workspace/i);
    fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);

    const card = await screen.findByRole("figure", { name: /creative preview for instagram/i });
    expect(card).toHaveTextContent("Spring offer");
    expect(card).toHaveTextContent("Book a free consultation this week.");
    expect(card).toHaveTextContent("Limited places.");
    expect(card).toHaveTextContent("An adviser at a desk");
    const image = await within(card).findByRole("img", { name: "An adviser at a desk" });
    expect(image.getAttribute("src")).toMatch(/^blob:/);
    expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
    fireEvent.load(image);
    await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
    expect(screen.getByText(/you have seen the attached media as saved/i)).toBeInTheDocument();
    expect(mediaCalls().map(([, o]) => o.method)).toEqual(["HEAD", "GET"]);
    expect(mediaCalls().every(([url, o]) => !/token|bucket|storage|key=/i.test(url) && o.headers.authorization === "Bearer customer-token" && Object.keys(o.headers).join() === "authorization")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /^render preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
    await screen.findByText("Approved");
    expect(screen.getByText(/manual publication required/i)).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: /creative preview for instagram/i })).toHaveTextContent("Spring offer");
    expect(global.fetch.mock.calls.some(([url]) => /publish|schedule/.test(url) && !/manual-publication/.test(url))).toBe(false);
  });
  describe("creative preview contract (bizgenie-api PR #205)", () => {
    // Drives the app to a campaign with one variant in review. `reviewCampaign` is returned by generate.
    async function reachReview({ version = 4 } = {}) {
      const saved = campaign(version, 3);
      const generated = JSON.parse(JSON.stringify(saved));
      const v = generated.campaign.items[0].variants[0];
      v.workflow = "review";
      v.platform = "instagram";
      v.placement = "feed";
      v.current_revision_id = "revision-1";
      v.current_content = { title: null, body: "stale list copy", caption: null, alt_text: null, asset_refs: [] };
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ recommendation }) })
        .mockResolvedValueOnce({ ok: true, json: async () => campaign(1, 0) })
        .mockResolvedValueOnce({ ok: true, json: async () => campaign(2, 1) })
        .mockResolvedValueOnce({ ok: true, json: async () => campaign(3, 2) })
        .mockResolvedValueOnce({ ok: true, json: async () => saved })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: generated.campaign }) });
      render(<App />);
      fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: "Promote the Audi A3 offer" } });
      fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
      await screen.findByText("Audi A3 Offer Campaign");
      fireEvent.click(screen.getByRole("button", { name: /^create campaign$/i }));
      await screen.findByText(/saved to your workspace/i);
      fireEvent.click(screen.getAllByRole("button", { name: /generate draft/i })[0]);
      return generated;
    }
    const writes = () => apiCalls().filter(([, o]) => o?.method === "POST").map(([url]) => url);
    const reviewWrites = () => writes().filter((url) => /preview-renders|preview-acknowledgements|approval|publish|schedule/.test(url));

    it("loads the exact saved creative first, blocks review while loading, escapes it, and never acknowledges or approves by itself", async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      creativeCopy = { title: "Spring offer", body: "<img src=x onerror=alert(1)> Book now", caption: null, alt_text: null };
      creativeHandler = async (url) => { await gate; return defaultCreativeHandler(url); };
      await reachReview();
      const container = document.body;
      const render = await screen.findByRole("button", { name: /^render preview$/i });
      expect(render).toBeDisabled();
      expect(screen.getByText(/review starts once it has loaded/i)).toBeInTheDocument();
      expect(writes().some((url) => /preview-renders|preview-acknowledgements|approval/.test(url))).toBe(false);
      release();
      const card = await screen.findByRole("figure", { name: /creative preview for instagram/i });
      await waitFor(() => expect(card).toHaveTextContent("Spring offer"));
      expect(card).toHaveTextContent("<img src=x onerror=alert(1)> Book now");
      expect(container.querySelector("figure img")).toBeNull();
      expect(screen.queryByText("stale list copy")).toBeNull();
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
      const [url, options] = creativeCalls()[0];
      const u = new URL(url);
      expect(Object.fromEntries(u.searchParams)).toEqual({ tenant_id: "tenant-1", project_id: "project-1", revision_id: "revision-1", expected_campaign_version: "4" });
      expect(options.headers.authorization).toBe("Bearer customer-token");
      expect(writes().some((w) => /preview-renders|preview-acknowledgements|approval/.test(w))).toBe(false);
    });

    it("says so and blocks review when no copy or media was saved", async () => {
      creativeCopy = { title: null, body: null, caption: null, alt_text: null };
      await reachReview();
      expect(await screen.findByText(/this version has no saved text/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
    });

    it("shows unavailable media explicitly and does not claim it was reviewed", async () => {
      creativeMedia = [
        { asset_id: "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21", role: "primary", media_kind: "image", mime_type: "image/png", source_kind: "generated", status: "unavailable", reason: "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE", url: null },
        { asset_id: "1a2b3c4d-4d3a-4f6b-8a1c-0e5d7a9b3c22", role: "supporting", media_kind: null, source_kind: null, status: "unavailable", reason: "ASSET_NOT_AVAILABLE", url: null },
      ];
      mediaHandler = () => mediaResponse(404);
      creativeCopy = { title: null, body: "Copy with media", caption: null, alt_text: "Adviser at a desk" };
      await reachReview();
      const card = await screen.findByRole("figure", { name: /creative preview for instagram/i });
      await waitFor(() => expect(card).toHaveTextContent("Copy with media"));
      expect(await within(card).findByText(/no longer available to you/i)).toBeInTheDocument();
      expect(card).toHaveTextContent(/a referenced visual is not available/i);
      expect(card.querySelector("img, video")).toBeNull();
      expect(mediaCalls().every(([url]) => url.includes("/assets/9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21/"))).toBe(true); // the revoked reference is never requested
      await waitFor(() => expect(screen.getByText(/couldn’t be displayed here\. acknowledging covers the text and the preview receipt only/i)).toBeInTheDocument());
      expect(screen.queryByText(/you have seen the attached media/i)).toBeNull();
      expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled();
    });

    const IMAGE_REF = { asset_id: "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21", role: "primary", media_kind: "image", mime_type: "image/png", source_kind: "generated", status: "unavailable", reason: "PRIVATE_MEDIA_DELIVERY_UNAVAILABLE", url: null };

    it("displays a delivered video with native controls and no autoplay, and viewing it writes nothing", async () => {
      creativeMedia = [{ ...IMAGE_REF, media_kind: "video", mime_type: "video/mp4" }];
      mediaHandler = () => mediaResponse(200, { mime: "video/mp4", bytes: new Uint8Array(16) });
      await reachReview();
      const card = await screen.findByRole("figure", { name: /creative preview for instagram/i });
      await waitFor(() => expect(card.querySelector("video")).not.toBeNull());
      const video = card.querySelector("video");
      expect(video.getAttribute("src")).toMatch(/^blob:/);
      expect(video.autoplay).toBe(false);
      expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled();
      fireEvent.loadedMetadata(video);
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
      expect(reviewWrites()).toEqual([]);
    });

    it("retries a transient media failure on request and holds review until the media is displayed", async () => {
      creativeMedia = [IMAGE_REF];
      let calls = 0;
      mediaHandler = (url, options) => (options.method === "HEAD" && ++calls === 1 ? mediaResponse(503) : mediaResponse(200));
      await reachReview();
      expect(await screen.findByText(/couldn’t be loaded right now/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled(); // an explicit failure does not pretend it was viewed
      expect(screen.getByText(/couldn’t be displayed here\. acknowledging covers the text and the preview receipt only/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /try again: load primary image/i }));
      const image = await screen.findByRole("img");
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeDisabled());
      fireEvent.load(image);
      await waitFor(() => expect(screen.getByText(/you have seen the attached media as saved/i)).toBeInTheDocument());
      expect(reviewWrites()).toEqual([]);
    });

    it("on a stale media request clears the media, reloads the campaign and fetches again against the new version", async () => {
      creativeMedia = [IMAGE_REF];
      let first = true;
      mediaHandler = (url, options) => { if (options.method === "HEAD" && first) { first = false; return mediaResponse(409); } return mediaResponse(200); };
      const generated = await reachReview();
      const latest = JSON.parse(JSON.stringify(generated));
      latest.campaign.version = 7;
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: latest.campaign }) });
      expect(await screen.findByText(/campaign changed since you opened it/i)).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("button", { name: /reload latest campaign/i })[0]);
      fireEvent.load(await screen.findByRole("img"));
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
      const versions = mediaCalls().map(([url]) => new URL(url).searchParams.get("expected_campaign_version"));
      expect(versions[0]).toBe("4");
      expect(versions.at(-1)).toBe("7");
      expect(reviewWrites()).toEqual([]);
    });

    it("keeps preview, acknowledge and approve intact with media and never calls a publish or schedule endpoint", async () => {
      creativeMedia = [IMAGE_REF];
      const generated = await reachReview();
      const v = generated.campaign.items[0].variants[0];
      const acknowledged = JSON.parse(JSON.stringify(generated)); acknowledged.campaign.version = 5;
      const approved = JSON.parse(JSON.stringify(acknowledged)); approved.campaign.version = 6; approved.campaign.items[0].variants[0].workflow = "approved";
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ preview: { render_receipt_id: "receipt-1", revision_id: "revision-1" } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: acknowledged.campaign, result: { created_ids: { preview_ids: ["preview-1"] } } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: approved.campaign }) });
      fireEvent.load(await screen.findByRole("img"));
      fireEvent.click(await screen.findByRole("button", { name: /^render preview$/i }));
      fireEvent.click(await screen.findByRole("button", { name: /^acknowledge preview$/i }));
      fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));
      await screen.findByText("Approved");
      expect(reviewWrites().map((url) => url.split("/").pop())).toEqual(["preview-renders", "preview-acknowledgements", "approval"]);
      expect(writes().some((url) => /publish|schedule/.test(url) && !/manual-publication/.test(url))).toBe(false);
      expect(v.variant_id).toBeTruthy();
    });

    it("on a version conflict clears the creative and reloads the campaign, then fetches against the new version", async () => {
      let calls = 0;
      creativeHandler = (url) => (++calls === 1 ? { ok: false, status: 409, json: async () => ({ error: { code: "VERSION_CONFLICT" } }) } : defaultCreativeHandler(url));
      const generated = await reachReview();
      const latest = JSON.parse(JSON.stringify(generated));
      latest.campaign.version = 7;
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ campaign: latest.campaign }) });
      expect(await screen.findByRole("alert")).toHaveTextContent(/campaign changed since you opened it/i);
      expect(screen.queryByRole("button", { name: /^render preview$/i })).toBeNull();
      expect(screen.getByRole("figure", { name: /creative preview for instagram/i })).toHaveTextContent(/could not be loaded/i);
      fireEvent.click(screen.getByRole("button", { name: /reload latest campaign/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
      expect(creativeCalls().map(([url]) => new URL(url).searchParams.get("expected_campaign_version"))).toEqual(["4", "7"]);
    });

    it("retries a transient failure without changing anything or inventing content", async () => {
      let calls = 0;
      creativeHandler = (url) => (++calls === 1 ? { ok: false, status: 503, json: async () => ({}) } : defaultCreativeHandler(url));
      await reachReview();
      expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
      expect(screen.queryByText("Server persisted review copy")).toBeNull();
      const before = apiCalls().length;
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(await screen.findByRole("figure", { name: /creative preview for instagram/i })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: /^render preview$/i })).toBeEnabled());
      expect(screen.getByText("Server persisted review copy")).toBeInTheDocument();
      expect(creativeCalls()).toHaveLength(2);
      expect(apiCalls()).toHaveLength(before);
    });
  });
});
