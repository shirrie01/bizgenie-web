// @vitest-environment jsdom
// Regression for the CI failure in MediaPreview.test.jsx:37 ("expected 'loading' to be 'displayed'").
// A browser may deliver an image's `load` event before React has run the passive effects of the commit that created
// the <img>. The "rendered" state must not be undone by such an effect. This test delivers `load` from a layout
// effect, i.e. deterministically BEFORE the passive effects of the same commit.
import React, { useLayoutEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("./useMediaPreview", () => ({
  useMediaPreview: ({ media }) => ({ key: "k", status: "ready", url: media.url, mime: "image/png", bytes: 8, error: "", code: "", retry: vi.fn(), discard: vi.fn() }),
}));
import MediaPreview from "./MediaPreview";

const props = { apiBaseUrl: "http://api.test", session: { status: "ready" }, campaign: { campaign_id: "c", version: 1 }, variant: { variant_id: "v" }, altText: "An adviser at a desk", onReload: vi.fn() };

function LoadsEarly({ children }) {
  const box = useRef(null);
  useLayoutEffect(() => { const img = box.current && box.current.querySelector("img"); if (img) img.dispatchEvent(new Event("load")); }, []);
  return <div ref={box}>{children}</div>;
}

afterEach(cleanup);

describe("MediaPreview: load event before passive effects", () => {
  it("still reports displayed", () => {
    const onStatus = vi.fn();
    render(<LoadsEarly><MediaPreview {...props} media={{ id: "a", role: "primary", kind: "image", url: "blob:test/1" }} onStatus={onStatus} /></LoadsEarly>);
    expect(onStatus.mock.calls.at(-1)[1]).toBe("displayed");
    expect(screen.getByText(/original image as saved, not how a platform will render it/i)).toBeInTheDocument();
    expect(screen.queryByText(/preparing the image/i)).toBeNull();
  });

  it("a NEW image (new url) still has to load before it is reported displayed", () => {
    const onStatus = vi.fn();
    const first = { id: "a", role: "primary", kind: "image", url: "blob:test/1" };
    const { rerender } = render(<MediaPreview {...props} media={first} onStatus={onStatus} />);
    act(() => { screen.getByRole("img").dispatchEvent(new Event("load")); });
    rerender(<MediaPreview {...props} media={{ ...first, url: "blob:test/2" }} onStatus={onStatus} />);
    // the first image's load must not count for the second
    expect(onStatus.mock.calls.at(-1)[1]).toBe("loading");
    expect(screen.getByText(/preparing the image/i)).toBeInTheDocument();
  });

  it("a failed image is not shown as displayed, and a new url gets a fresh chance", () => {
    const onStatus = vi.fn();
    const first = { id: "a", role: "primary", kind: "image", url: "blob:test/1" };
    const { rerender } = render(<MediaPreview {...props} media={first} onStatus={onStatus} />);
    act(() => { screen.getByRole("img").dispatchEvent(new Event("error")); });
    expect(onStatus.mock.calls.at(-1)[1]).toBe("error");
    rerender(<MediaPreview {...props} media={{ ...first, url: "blob:test/2" }} onStatus={onStatus} />);
    expect(onStatus.mock.calls.at(-1)[1]).toBe("loading");
  });
});
