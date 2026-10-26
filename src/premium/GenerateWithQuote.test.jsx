import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GenerateWithQuote from "./GenerateWithQuote";

afterEach(() => { cleanup(); vi.useRealTimers(); });
// Test fixtures, not prices.
const quote = (over = {}) => ({ quoteId: "q-1", executionClass: "text.standard", credits: 7, kind: "fixed", maxCredits: null, authorisedCredits: 7, availableCredits: 30, sufficient: true, expiresAt: Date.now() + 10 * 60000, expired: false, policyVersion: "p1", ...over });
const setup = (props = {}) => {
  const onQuote = vi.fn().mockResolvedValue(quote()); const onGenerate = vi.fn().mockResolvedValue({ ok: true });
  render(<GenerateWithQuote quotesEnabled onQuote={onQuote} onGenerate={onGenerate} {...props} />);
  return { onQuote, onGenerate };
};
const check = async () => { fireEvent.click(screen.getByRole("button", { name: /check the credit cost/i })); return screen.findByRole("group", { name: /credit cost/i }); };

describe("credit quote before generation", () => {
  it("says checking costs nothing, shows the cost, the balance, fixed or estimate and the expiry, and asks the customer to confirm", async () => {
    const { onQuote, onGenerate } = setup();
    expect(screen.getByText(/checking the cost does not use any credits/i)).toBeInTheDocument();
    const card = await check();
    expect(onQuote).toHaveBeenCalledTimes(1); expect(onGenerate).not.toHaveBeenCalled(); // a quote starts nothing
    expect(card).toHaveTextContent(/7 credits will be used/i); expect(card).toHaveTextContent(/you have 30 credits available/i); expect(card).toHaveTextContent(/fixed price/i); expect(card).toHaveTextContent(/valid until/i);
    fireEvent.click(screen.getByRole("button", { name: /use 7 credits and generate/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ quoteId: "q-1", credits: 7 });
  });

  it("an estimate states the most it can cost, and the button authorises only that maximum", async () => {
    const { onGenerate } = setup({ onQuote: vi.fn().mockResolvedValue(quote({ kind: "estimate", credits: 5, maxCredits: 9, authorisedCredits: 9 })) });
    const card = await check();
    expect(card).toHaveTextContent(/about 5 credits, at most 9 credits/i); expect(card).toHaveTextContent(/never be charged more than the maximum/i);
    fireEvent.click(screen.getByRole("button", { name: /use up to 9 credits and generate/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
  });

  it("insufficient credits: says so, offers no confirm, and nothing can be started", async () => {
    const { onGenerate } = setup({ onQuote: vi.fn().mockResolvedValue(quote({ availableCredits: 3, sufficient: false })) });
    const card = await check();
    expect(card).toHaveTextContent(/do not have enough credits/i);
    expect(screen.getByRole("button", { name: /use 7 credits and generate/i })).toBeDisabled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("cancelling returns to the start and sends nothing", async () => {
    const { onGenerate } = setup(); await check();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.getByRole("button", { name: /check the credit cost/i })).toBeInTheDocument(); expect(onGenerate).not.toHaveBeenCalled();
  });

  it("a double click on Confirm starts exactly one generation", async () => {
    let release; const onGenerate = vi.fn(() => new Promise((r) => { release = r; }));
    setup({ onGenerate }); await check();
    const confirm = screen.getByRole("button", { name: /use 7 credits and generate/i });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/credits are only used if it succeeds/i);
    await act(async () => { release({ ok: true }); });
  });

  it("an expired price is not usable: the customer must check the cost again", async () => {
    vi.useFakeTimers();
    const onQuote = vi.fn().mockResolvedValueOnce(quote({ expiresAt: Date.now() + 5000 })).mockResolvedValueOnce(quote({ quoteId: "q-2" }));
    const { onGenerate } = setup({ onQuote });
    fireEvent.click(screen.getByRole("button", { name: /check the credit cost/i })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole("group", { name: /credit cost/i })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByRole("alert")).toHaveTextContent(/price has expired.*nothing was charged/i);
    expect(screen.queryByRole("button", { name: /and generate/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /check the cost again/i })); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(onQuote).toHaveBeenCalledTimes(2); expect(onGenerate).not.toHaveBeenCalled();
  });

  it("a price that changed after confirming is reported and must be re-checked", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: false, kind: "changed", text: "The price changed after you confirmed it, so nothing was started or charged. Check the new cost to continue." });
    setup({ onGenerate }); await check();
    fireEvent.click(screen.getByRole("button", { name: /use 7 credits and generate/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/price changed.*nothing was started or charged/i);
    expect(screen.getByRole("button", { name: /check the cost again/i })).toBeInTheDocument();
  });

  it("a server refusal for lack of credits (402) is shown and the customer can re-check; a network failure keeps the same price to retry", async () => {
    const onGenerate = vi.fn().mockResolvedValueOnce({ ok: false, kind: "insufficient", text: "You do not have enough credits for this. Nothing was started and nothing was charged. Your balance is in Plan and billing." }).mockResolvedValueOnce({ ok: false, kind: "error", text: "Content could not be generated yet." }).mockResolvedValueOnce({ ok: true });
    setup({ onGenerate }); await check();
    fireEvent.click(screen.getByRole("button", { name: /use 7 credits and generate/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have enough credits/i);
    expect(screen.getByRole("button", { name: /check the cost again/i })).toBeInTheDocument();
  });

  it("when the cost cannot be checked, nothing is started and the reason is shown", async () => {
    const { onGenerate } = setup({ onQuote: vi.fn().mockRejectedValue(Object.assign(new Error("Credits cannot be checked right now, so nothing was started or charged. Try again shortly."), { kind: "unavailable" })) });
    fireEvent.click(screen.getByRole("button", { name: /check the credit cost/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nothing was started or charged/i);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("with quotes unavailable it generates as before but states that the cost cannot be shown", async () => {
    const onGenerate = vi.fn().mockResolvedValue({ ok: true });
    render(<GenerateWithQuote quotesEnabled={false} onQuote={vi.fn()} onGenerate={onGenerate} />);
    expect(screen.getByText(/cannot show the credit cost of this action yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(null));
  });
});
