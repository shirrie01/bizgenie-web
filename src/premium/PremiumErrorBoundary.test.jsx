import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PremiumErrorBoundary from "./PremiumErrorBoundary";

afterEach(cleanup);
const Boom = () => { throw new Error("secret internal detail: token abc123"); };

describe("PremiumErrorBoundary", () => {
  it("shows a calm recovery message instead of a blank page, with no error text, and a reload button", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn(); const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    render(<PremiumErrorBoundary><Boom /></PremiumErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong showing this page/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/has not been changed by this error/i);
    expect(document.body.textContent).not.toMatch(/secret internal detail|abc123/);
    fireEvent.click(screen.getByRole("button", { name: /reload this page/i }));
    expect(reload).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, "location", { configurable: true, value: original });
    spy.mockRestore();
  });
  it("renders children untouched when nothing fails", () => {
    render(<PremiumErrorBoundary><p>fine</p></PremiumErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
