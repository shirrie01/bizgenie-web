import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";

const getCustomerSessionMock = vi.fn();

vi.mock("../session", () => ({
  getCustomerSession: (...args) => getCustomerSessionMock(...args),
}));

vi.mock("../authClient", () => ({
  onAuthStateChange: vi.fn(() => () => {}),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
}));

function typeGoalAndSubmit(goalText) {
  fireEvent.change(screen.getByLabelText(/your goal/i), { target: { value: goalText } });
  fireEvent.click(screen.getByRole("button", { name: /get my recommendation/i }));
}

beforeEach(() => {
  getCustomerSessionMock.mockReset();
  global.fetch = vi.fn();
});

describe("goal-first auth gate", () => {
  it("does not call the recommendation API before sign-in, and shows a sign-in prompt", async () => {
    getCustomerSessionMock.mockResolvedValue({ status: "signed-out" });
    render(<App />);

    typeGoalAndSubmit("Launch our new product next Friday");

    await waitFor(() => {
      expect(screen.getByText(/sign in to get your recommendation/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
    // The goal itself must remain visible/preserved through the sign-in prompt.
    expect(screen.getByLabelText(/your goal/i)).toHaveValue("Launch our new product next Friday");
  });

  it("does not call the recommendation API when signed in but scope is missing", async () => {
    getCustomerSessionMock.mockResolvedValue({ status: "scope-missing", accessToken: "token-abc" });
    render(<App />);

    typeGoalAndSubmit("Launch our new product next Friday");

    await waitFor(() => {
      expect(screen.getByText(/account setup isn.t finished yet/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls the recommendation API with the session's bearer token and scope once fully authenticated", async () => {
    getCustomerSessionMock.mockResolvedValue({
      status: "ready",
      accessToken: "real-access-token",
      tenantId: "tenant-1",
      projectId: "project-1",
      brandId: "brand-1",
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        recommendation: { campaign_name: "Test Campaign", explanation: "Because", suggested_items: [] },
      }),
    });

    render(<App />);
    typeGoalAndSubmit("Launch our new product next Friday");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/customer/campaign-recommendations");
    expect(options.headers.authorization).toBe("Bearer real-access-token");

    const body = JSON.parse(options.body);
    expect(body.tenant_id).toBe("tenant-1");
    expect(body.project_id).toBe("project-1");
    expect(body.brand_id).toBe("brand-1");
    expect(body.goal).toBe("Launch our new product next Friday");
  });

  it("never creates a campaign as a side effect of authentication alone", async () => {
    getCustomerSessionMock.mockResolvedValue({
      status: "ready",
      accessToken: "real-access-token",
      tenantId: "tenant-1",
      projectId: "project-1",
      brandId: "brand-1",
    });
    render(<App />);
    // No goal submitted — merely having a ready session must not trigger any request.
    await waitFor(() => expect(getCustomerSessionMock).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
