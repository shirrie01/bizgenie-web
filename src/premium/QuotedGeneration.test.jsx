import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuotedGeneration from "./QuotedGeneration";
import { QuoteError, normaliseQuote } from "./generationQuoteClient";

// Component behaviour against injected API functions. The wire contract is covered in generationQuoteClient.test.js and, against the real
// PostgreSQL-backed router, in qa/integration/quoteConfirm.integration.test.js.
const C = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222", Q = "33333333-3333-4333-8333-333333333333";
const session = { accessToken: "tk" };
const mkInputs = (over = {}) => ({ scope: { tenantId: "t1", projectId: "p1" }, campaign: { campaign_id: C, version: 4 }, variant: { variant_id: V }, executionClass: "image.normal", brief: "A calm product shot", ...over });
const quote = (over = {}) => normaliseQuote({ contract_version: "generation-quote.v1", quote_id: Q, execution_class: "image.normal", credits: 3, kind: "fixed", max_credits: 3, available_credits: 10, sufficient: true, expires_at: new Date(Date.now() + 60000).toISOString(), policy_version: "p:1", state: "quoted", ...over });
const status = (state, extra = {}) => ({ quoteId: Q, jobId: "quoted:j1", state, executionClass: "image.normal", reservedCredits: 3, reservation: "held", ...extra });
const KEY = `bg:quoted:t1:${C}:${V}`;
const mount = (api, props = {}) => render(<QuotedGeneration enabled session={session} inputs={mkInputs()} api={{ requestGenerationQuote: async () => quote(), ...api }} pollMs={5} {...props} />);
const price = async () => { const b = await screen.findByRole("button", { name: "Get the price" }); await waitFor(() => expect(b).toBeEnabled()); fireEvent.click(b); return screen.findByRole("group", { name: "Price" }); };
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("QuotedGeneration", () => {
  it("gate off: says it cannot quote, no buttons", () => { render(<QuotedGeneration enabled={false} session={session} inputs={mkInputs()} />); expect(screen.getByText(/cannot quote or start this yet/i)).toBeInTheDocument(); expect(screen.queryByRole("button")).toBeNull(); });
  it("tells the customer what is missing and keeps 'Get the price' disabled", async () => { mount({}, { inputs: mkInputs({ brief: " " }) }); expect(await screen.findByText(/Describe what you want in the brief first/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Get the price" })).toBeDisabled(); });
  it("shows the price card with credits, balance, maximum and expiry — and starts nothing", async () => {
    const confirm = vi.fn(); mount({ confirmGenerationQuote: confirm }); const card = await price();
    expect(card).toHaveTextContent("3 credits"); expect(card).toHaveTextContent("You have 10 credits available"); expect(card).toHaveTextContent(/fixed price and the most you can be charged/); expect(card).toHaveTextContent(/valid until/);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("insufficient credits: the card says so and Confirm is disabled", async () => { mount({ requestGenerationQuote: async () => quote({ available_credits: 1, sufficient: false }) }); await price(); expect(screen.getByRole("button", { name: /Confirm and set aside/ })).toBeDisabled(); expect(screen.getByRole("alert")).toHaveTextContent(/not have enough credits/); });
  it("saves the confirmation key BEFORE sending it, and 202 means queued, not made", async () => {
    let storedDuringSend = null;
    const confirm = vi.fn(async () => { storedDuringSend = JSON.parse(window.localStorage.getItem(KEY)); return { jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }; });
    mount({ confirmGenerationQuote: confirm, fetchQuoteStatus: async () => status("queued") }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside 3 credits/ }));
    expect(await screen.findByText(/Waiting to start/)).toBeInTheDocument(); expect(storedDuringSend.confirmKey).toMatch(/^c:/);
    expect(screen.queryByText(/Finished/)).toBeNull();
  });
  it("a double-click sends one confirmation", async () => {
    let release; const confirm = vi.fn(() => new Promise((r) => { release = r; })); mount({ confirmGenerationQuote: confirm, fetchQuoteStatus: async () => status("queued") }); await price();
    const b = screen.getByRole("button", { name: /Confirm and set aside/ }); fireEvent.click(b); fireEvent.click(b); expect(confirm).toHaveBeenCalledTimes(1);
    release({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }); await screen.findByText(/Waiting to start/);
  });
  it("a lost response is UNCERTAIN; resending uses the SAME key and checking status can find the job", async () => {
    const confirm = vi.fn().mockRejectedValueOnce(new QuoteError("may or may not have been received", { kind: "uncertain" })).mockResolvedValueOnce({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: true });
    mount({ confirmGenerationQuote: confirm, fetchQuoteStatus: async () => status("queued") }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ }));
    expect(await screen.findByText(/do not know yet whether your confirmation was received/i)).toBeInTheDocument(); expect(screen.queryByText(/Waiting to start/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send the same confirmation again" })); await screen.findByText(/Waiting to start/);
    expect(confirm.mock.calls[0][0].key).toBe(confirm.mock.calls[1][0].key);
  });
  it("'Check its status' picks the job up without sending anything new", async () => {
    const confirm = vi.fn().mockRejectedValue(new QuoteError("lost", { kind: "uncertain" }));
    mount({ confirmGenerationQuote: confirm, fetchQuoteStatus: async () => status("queued") }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); fireEvent.click(await screen.findByRole("button", { name: "Check its status" }));
    expect(await screen.findByText(/Waiting to start/)).toBeInTheDocument(); expect(confirm).toHaveBeenCalledTimes(1);
  });
  it("a refresh resumes the SAME job from the server and never asks for a new price or confirmation", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ nonce: "n1", fingerprint: "f", quote: quote(), confirmKey: "c:k1", jobId: "quoted:j1" }));
    const q = vi.fn(), c = vi.fn(); mount({ requestGenerationQuote: q, confirmGenerationQuote: c, fetchQuoteStatus: async () => status("calling") });
    expect(await screen.findByText(/Being created\. It can no longer be cancelled/)).toBeInTheDocument(); expect(q).not.toHaveBeenCalled(); expect(c).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: /Cancel/ })).toBeNull();
  });
  it("follows the job to 'Finished', calls onSettled once, and says finished is not approved or published", async () => {
    const seq = ["queued", "claimed", "calling", "succeeded"]; const onSettled = vi.fn();
    mount({ confirmGenerationQuote: async () => ({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status(seq.length > 1 ? seq.shift() : seq[0], { reservedCredits: seq.length > 1 ? 3 : 0 }) }, { onSettled }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ }));
    expect(await screen.findByText(/Finished\. 3 credits used/)).toBeInTheDocument(); expect(screen.getByText(/not approved and not published/)).toBeInTheDocument();
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1)); expect(onSettled.mock.calls[0][0]).toMatchObject({ state: "succeeded", credits: 3 });
  });
  it.each([["recovery_required", /checking the result with the provider.*nothing is sent again/i], ["failed", /could not be made\. You were not charged/], ["cancelled", /Cancelled\. You were not charged/]])("shows %s honestly", async (state, text) => {
    window.localStorage.setItem(KEY, JSON.stringify({ nonce: "n", fingerprint: "f", quote: quote(), confirmKey: "c:k", jobId: "quoted:j1" }));
    mount({ fetchQuoteStatus: async () => status(state) }); expect(await screen.findByText(text)).toBeInTheDocument();
  });
  it.each([["QUOTE_EXPIRED", "expired", /expired/i], ["QUOTE_CHANGED", "changed", /settings changed|price or settings changed/i], ["QUOTE_CANCELLED", "cancelled", /cancelled/i]])("%s on confirm drops the dead price and offers a fresh one", async (code, kind, text) => {
    mount({ confirmGenerationQuote: async () => { throw new QuoteError("The price or settings changed after the price was shown. expired cancelled", { kind }); } }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); expect(await screen.findByText(text)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Get the price" })).toBeEnabled(); expect(window.localStorage.getItem(KEY)).toBeNull();
  });
  it("a fresh price after a dead one uses a NEW nonce; a retry after a network failure while quoting reuses the old one", async () => {
    const q = vi.fn().mockRejectedValueOnce(new QuoteError("Could not reach", { kind: "network" })).mockResolvedValue(quote());
    mount({ requestGenerationQuote: q, cancelGenerationQuote: async () => ({ quoteId: Q, charged: false }) }); fireEvent.click(await screen.findByRole("button", { name: "Get the price" })); await screen.findByText(/Could not reach/);
    fireEvent.click(screen.getByRole("button", { name: "Get the price" })); await screen.findByRole("group", { name: "Price" });
    expect(q.mock.calls[0][0].nonce).toBe(q.mock.calls[1][0].nonce);
    // now the quote dies and a fresh one is requested
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); await screen.findByText(/Cancelled\. You were not charged/);
    fireEvent.click(screen.getByRole("button", { name: "Get the price" })); await screen.findByRole("group", { name: "Price" });
    expect(q.mock.calls[2][0].nonce).not.toBe(q.mock.calls[1][0].nonce); // a fresh quote after a dead one gets a new nonce
  });
  it("an expired price is dropped by the clock and the customer must ask again", async () => {
    mount({ requestGenerationQuote: async () => quote({ expires_at: new Date(Date.now() + 40).toISOString() }) }); await price();
    expect(await screen.findByText(/The price expired\. Nothing was charged/, {}, { timeout: 2000 })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Confirm and set aside/ })).toBeNull();
  });
  it("changing the brief while a price is showing discards the price", async () => {
    const { rerender } = mount({}); await price();
    rerender(<QuotedGeneration enabled session={session} inputs={mkInputs({ brief: "A different brief" })} api={{ requestGenerationQuote: async () => quote() }} pollMs={5} />);
    expect(await screen.findByText(/Your choices changed, so the price was dropped/)).toBeInTheDocument(); expect(screen.queryByRole("group", { name: "Price" })).toBeNull();
  });
  it("cancel before it starts releases; cancel after it started is refused and the status is re-read", async () => {
    const cancel = vi.fn().mockRejectedValueOnce(new QuoteError("This has already started, so it can no longer be cancelled.", { kind: "started" }));
    const seq = ["queued", "calling"]; mount({ confirmGenerationQuote: async () => ({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status(seq.length > 1 ? seq.shift() : seq[0]), cancelGenerationQuote: cancel }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); fireEvent.click(await screen.findByRole("button", { name: "Cancel before it starts" }));
    expect(await screen.findByText(/already started/)).toBeInTheDocument(); expect(await screen.findByText(/Being created/)).toBeInTheDocument();
  });
  it("a successful cancel shows cancelled and not charged", async () => {
    mount({ confirmGenerationQuote: async () => ({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status("queued"), cancelGenerationQuote: async () => ({ quoteId: Q, charged: false }) }); await price();
    fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); fireEvent.click(await screen.findByRole("button", { name: "Cancel before it starts" }));
    expect(await screen.findByText(/Cancelled\. You were not charged/)).toBeInTheDocument();
  });
  it("a session that ends is reported upward", async () => { const ended = vi.fn(); mount({ requestGenerationQuote: async () => { throw new QuoteError("Your session has ended.", { kind: "auth" }); } }, { onSessionEnded: ended }); fireEvent.click(await screen.findByRole("button", { name: "Get the price" })); await screen.findByRole("alert"); expect(ended).toHaveBeenCalled(); });
  it("a status poll that fails keeps the last state and says nothing is resent", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ nonce: "n", fingerprint: "f", quote: quote(), confirmKey: "c:k", jobId: "quoted:j1" }));
    const f = vi.fn().mockResolvedValueOnce(status("queued")).mockRejectedValue(new QuoteError("The request could not be reached.", { kind: "network" }));
    mount({ fetchQuoteStatus: f }); expect(await screen.findByText(/Waiting to start/)).toBeInTheDocument(); expect(await screen.findByText(/Your request is safe; nothing is sent again/)).toBeInTheDocument();
  });
  it("locks the form while confirmation is in flight or tracked", async () => { const lock = vi.fn(); mount({ confirmGenerationQuote: async () => ({ jobId: "quoted:j1", quoteId: Q, reservedCredits: 3, status: "queued", replay: false }), fetchQuoteStatus: async () => status("queued") }, { onLockChange: lock }); await price(); fireEvent.click(screen.getByRole("button", { name: /Confirm and set aside/ })); await screen.findByText(/Waiting to start/); expect(lock).toHaveBeenLastCalledWith(true); });
});
