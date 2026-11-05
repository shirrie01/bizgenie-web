// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("./session", () => ({ refreshCustomerSession: (...a) => refreshMock(...a) }));
import MediaPreview from "./MediaPreview";

const ASSET = "9b2f7c1e-4d3a-4f6b-8a1c-0e5d7a9b3c21";
const session = { status: "ready", accessToken: "tok", tenantId: "t", projectId: "p" };
const campaign = { campaign_id: "22222222-2222-4222-8222-222222222222", version: 3 };
const variant = { variant_id: "44444444-4444-4444-8444-444444444440", current_revision_id: "rev-1" };
const reply = (status = 200, mime = "image/png", length = 8) => ({ ok: status === 200, status, headers: new Headers(status === 200 ? { "content-type": mime, "content-length": String(length) } : {}), arrayBuffer: async () => new Uint8Array(length).buffer });
const setup = (media, extra = {}) => {
  const onStatus = vi.fn();
  const utils = render(<MediaPreview apiBaseUrl="http://api.test" session={session} campaign={campaign} variant={variant} media={media} altText="An adviser at a desk" onStatus={onStatus} onReload={vi.fn()} {...extra} />);
  return { onStatus, ...utils };
};
const image = { id: ASSET, role: "primary", kind: "image" };
const video = { id: ASSET, role: "primary", kind: "video" };
const lastStatus = (onStatus) => onStatus.mock.calls.at(-1)?.[1];

beforeEach(() => { global.fetch = vi.fn(); URL.createObjectURL = vi.fn(() => "blob:test/1"); URL.revokeObjectURL = vi.fn(); refreshMock.mockReset(); });
afterEach(cleanup);

describe("MediaPreview", () => {
  it("shows loading, then the image with its alt text, and reports displayed only after the browser rendered it", async () => {
    global.fetch.mockResolvedValue(reply());
    const { onStatus } = setup(image);
    expect(screen.getByRole("status")).toHaveTextContent(/loading the image/i);
    expect(lastStatus(onStatus)).toBe("loading");
    const img = await screen.findByRole("img", { name: "An adviser at a desk" });
    expect(img).toHaveAttribute("src", "blob:test/1");
    expect(lastStatus(onStatus)).toBe("loading"); // bytes arrived but nothing has been rendered yet
    fireEvent.load(img);
    await waitFor(() => expect(lastStatus(onStatus)).toBe("displayed"));
    expect(screen.getByText(/original image as saved, not how a platform will render it/i)).toBeInTheDocument();
    expect(screen.queryByText(/play automatically/i)).toBeNull();
  });

  it("labels a missing description honestly instead of using empty alt", async () => {
    global.fetch.mockResolvedValue(reply());
    setup(image, { altText: "" });
    expect(await screen.findByRole("img", { name: /no description provided/i })).toBeInTheDocument();
  });

  it("renders a video with controls, no autoplay, and reports displayed after metadata loads", async () => {
    global.fetch.mockResolvedValue(reply(200, "video/mp4", 16));
    const { onStatus, container } = setup(video);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const el = container.querySelector("video");
    expect(el).toHaveAttribute("controls");
    expect(el.autoplay).toBe(false);
    expect(el.getAttribute("preload")).toBe("metadata");
    expect(el).toHaveAttribute("aria-label", "An adviser at a desk");
    expect(lastStatus(onStatus)).toBe("loading");
    fireEvent.loadedMetadata(el);
    await waitFor(() => expect(lastStatus(onStatus)).toBe("displayed"));
    expect(screen.getByText(/does not play automatically/i)).toBeInTheDocument();
  });

  it("says the browser can't display bytes it received, and reports an error", async () => {
    global.fetch.mockResolvedValue(reply());
    const { onStatus } = setup(image);
    fireEvent.error(await screen.findByRole("img"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t be displayed in your browser/i);
    expect(lastStatus(onStatus)).toBe("error");
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1"); // rejected bytes are dropped at once
  });

  it("offers an accessible Try again for transient failures and recovers", async () => {
    global.fetch.mockResolvedValueOnce(reply(503)).mockResolvedValue(reply());
    const { onStatus } = setup(image);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t be loaded right now/i);
    expect(lastStatus(onStatus)).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: /try again: load primary image/i }));
    fireEvent.load(await screen.findByRole("img"));
    await waitFor(() => expect(lastStatus(onStatus)).toBe("displayed"));
  });

  it("revoked or foreign media is an explicit dead end with no retry and no image", async () => {
    global.fetch.mockResolvedValue(reply(404));
    const { container } = setup(image);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available to you/i);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("img, video")).toBeNull();
  });

  it("offers Reload latest campaign on a version conflict", async () => {
    global.fetch.mockResolvedValue(reply(409));
    const { onStatus } = setup(image);
    expect(await screen.findByRole("alert")).toHaveTextContent(/campaign changed since you opened it/i);
    expect(lastStatus(onStatus)).toBe("error");
    expect(screen.getByRole("button", { name: /reload latest campaign/i })).toBeInTheDocument();
  });

  it("says a large video isn't previewable yet and does not download it", async () => {
    global.fetch.mockResolvedValue(reply(200, "video/mp4", 40 * 1024 * 1024));
    setup(video);
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large to preview here yet/i);
    expect(global.fetch.mock.calls.every(([, o]) => o.method === "HEAD")).toBe(true);
  });

  it("revokes the blob URL on unmount", async () => {
    global.fetch.mockResolvedValue(reply());
    const { unmount } = setup(image);
    await screen.findByRole("img");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });
});
