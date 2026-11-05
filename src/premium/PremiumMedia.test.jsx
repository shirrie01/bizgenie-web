import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumMedia from "./PremiumMedia";
import { MediaError, normaliseAsset, normaliseAssetList } from "./mediaIntakeClient";

afterEach(cleanup);
beforeAll(() => { URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn(); });
const session = { accessToken: "tk" }; const scope = { tenantId: "t", projectId: "p", brandId: "b" };
const A = (o = {}) => ({ asset_id: "a1", filename: "shop.png", kind: "image", content_type: "image/png", bytes: 2048, state: "ready", rights_policy_version: "rights.v1", created_at: "2026-10-27T10:00:00Z", ...o });
const L = (list) => normaliseAssetList({ assets: list, next_cursor: null });
const mount = (api, props = {}) => render(<PremiumMedia enabled session={session} scope={scope} isOwner api={{ fetchAssetPreview: async () => "blob:thumb", ...api }} {...props} />);
const pick = (f) => fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [f] } });
const png = (o = {}) => new File([new Uint8Array(10)], "shop.png", { type: "image/png", ...o });

describe("PremiumMedia", () => {
  it("gate off: says nothing was uploaded, offers no controls, calls nothing", () => {
    const f = vi.fn(); render(<PremiumMedia enabled={false} session={session} scope={scope} isOwner api={{ fetchAssets: f }} />);
    expect(screen.getByText(/not switched on in BizGenie yet/)).toBeInTheDocument(); expect(screen.queryByRole("button")).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("loading, empty, and an error that can be retried", async () => {
    const f = vi.fn().mockRejectedValueOnce(new MediaError("Adding your own media is not switched on for this workspace yet.", { kind: "unavailable" })).mockResolvedValue(L([]));
    mount({ fetchAssets: f }); expect(screen.getByText("Loading your media…")).toBeInTheDocument(); expect(await screen.findByRole("alert")).toHaveTextContent(/not switched on for this workspace/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(await screen.findByText("You have not added any files yet.")).toBeInTheDocument();
  });
  it("lists files with their server state; only ready ones are 'Ready to use'; images preview through the authenticated fetch", async () => {
    const prev = vi.fn(async () => "blob:thumb");
    mount({ fetchAssets: async () => L([A(), A({ asset_id: "a2", filename: "bad.png", state: "rejected" }), A({ asset_id: "a3", filename: "clip.mp4", kind: "video", content_type: "video/mp4" })]), fetchAssetPreview: prev });
    const list = await screen.findByRole("list", { name: "Your files" }); expect(list).toHaveTextContent("Ready to use"); expect(list).toHaveTextContent("Did not pass the safety check"); expect(await screen.findByAltText("Your file shop.png")).toBeInTheDocument();
    expect(prev).toHaveBeenCalledTimes(1); expect(prev.mock.calls[0][0]).toMatchObject({ assetId: "a1" });
  });
  it("adding needs a valid file AND the rights confirmation; success says the confirmation is the customer's own", async () => {
    const add = vi.fn(async ({ onStep }) => { onStep("checking"); return normaliseAsset(A()); });
    mount({ fetchAssets: async () => L([]), addFile: add }); await screen.findByText("You have not added any files yet.");
    const btn = screen.getByRole("button", { name: "Add file" }); expect(btn).toBeDisabled();
    pick(new File([new Uint8Array(10)], "shop.gif", { type: "image/gif" })); expect(await screen.findByRole("alert")).toHaveTextContent(/Only PNG/); pick(png()); expect(btn).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/I own this file/)); await waitFor(() => expect(btn).toBeEnabled()); fireEvent.click(btn);
    expect(await screen.findByText(/shop\.png is ready to use\. Your rights confirmation was recorded as entered by you \(terms version rights\.v1\)/)).toBeInTheDocument();
    expect(add.mock.calls[0][0].file.name).toBe("shop.png");
  });
  it("a rejected file is stated plainly; a lost response keeps the same upload key for the retry", async () => {
    const add = vi.fn().mockRejectedValueOnce(new MediaError("may not have completed", { kind: "unconfirmed" })).mockResolvedValueOnce(normaliseAsset(A({ state: "rejected" })));
    mount({ fetchAssets: async () => L([]), addFile: add }); await screen.findByText("You have not added any files yet.");
    pick(png()); fireEvent.click(screen.getByLabelText(/I own this file/)); fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    expect(await screen.findByText(/may not have completed/)).toHaveClass("ps-warn"); fireEvent.click(screen.getByRole("button", { name: "Add file" }));
    expect(await screen.findByText(/did not pass the safety check\. It is kept privately and cannot be used/)).toBeInTheDocument(); expect(add.mock.calls[0][0].key).toBe(add.mock.calls[1][0].key);
  });
  it("removing asks first and says posts already using the file are unchanged", async () => {
    const rev = vi.fn(async () => normaliseAsset(A({ state: "revoked" })));
    mount({ fetchAssets: async () => L([A()]), revokeAsset: rev }); fireEvent.click(await screen.findByRole("button", { name: "Remove shop.png" }));
    expect(rev).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Withdraw it" })); expect(await screen.findByText(/Posts that already use it are unchanged/)).toBeInTheDocument(); expect(rev.mock.calls[0][0].assetId).toBe("a1");
  });
  it("a member can see files but not add or remove", async () => {
    mount({ fetchAssets: async () => L([A()]) }, { isOwner: false }); expect(await screen.findByRole("list", { name: "Your files" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a file")).toBeNull(); expect(screen.queryByRole("button", { name: /remove/i })).toBeNull(); expect(screen.getByText(/Only the workspace owner can add or remove/)).toBeInTheDocument();
  });
  it("an ended session is reported", async () => { const ended = vi.fn(); mount({ fetchAssets: async () => { throw new MediaError("Your session has ended.", { kind: "auth" }); } }, { onSessionEnded: ended }); await screen.findByRole("alert"); expect(ended).toHaveBeenCalled(); });
});
