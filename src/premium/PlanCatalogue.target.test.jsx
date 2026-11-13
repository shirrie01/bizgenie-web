// BG-WEB-LAUNCH-CLOSURE-14: how the plan screen renders the founder's initial TARGET (Standard £99/month, 60 monthly credits).
// The target is test input only. It is NOT an approved public price (DEC-013) and nothing in src/ contains it: the screen shows exactly what the server catalogue says.
// VAT presentation, video-credit classes, cancellation/refund terms and credit expiry are not decided, so the screen must not state them.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PlanCatalogue from "./PlanCatalogue";
import { formatMoney, normaliseCatalogue } from "./planCatalogueClient";
import fs from "node:fs";
import path from "node:path";

afterEach(cleanup);
const entry = (tax) => ({ plan_code: "standard", plan_version: 1, amount_minor: 9900, currency: "GBP", billing_cadence: "month", tax, credit_grant_cadence: "month", included_credits: 60, policy_id: "fixture.standard.v1",
  entitlement_codes: ["standard"], effective_from: "2026-12-01T00:00:00.000Z", effective_to: null, terms: { version: "fixture-1", url: "https://example.test/terms", cancellation_url: "https://example.test/cancel", refund_url: "https://example.test/refund" },
  approval: { decision: "FIXTURE-DECISION", source: "https://example.test/decision", approved_at: "2026-12-01T00:00:00.000Z" } });
const cat = (tax) => normaliseCatalogue({ contract_version: "commercial-catalog.v1", plans: [entry(tax)] });

describe("plan screen with the £99 / 60-credit target as server data", () => {
  it("formats pence correctly and shows one monthly price and the monthly allowance", () => {
    expect(formatMoney(9900, "GBP")).toBe("£99.00");
    render(<PlanCatalogue catalogue={cat({ presentation: "exclusive", jurisdiction: "United Kingdom", wording: "FIXTURE: VAT added at checkout." })} env={{}} />);
    expect(screen.getByText("£99.00")).toBeInTheDocument();
    expect(screen.getByText(/per month/)).toBeInTheDocument();
    expect(screen.getByText("60 credits each month")).toBeInTheDocument();
  });
  it("VAT is whatever the server states: 'tax added' or 'tax included' with its own wording; nothing is assumed", () => {
    const a = render(<PlanCatalogue catalogue={cat({ presentation: "exclusive", jurisdiction: "United Kingdom", wording: "FIXTURE ADDED" })} env={{}} />);
    expect(screen.getByText(/Tax added \(United Kingdom\)\. FIXTURE ADDED/)).toBeInTheDocument(); a.unmount();
    render(<PlanCatalogue catalogue={cat({ presentation: "inclusive", jurisdiction: "United Kingdom", wording: "FIXTURE INCLUDED" })} env={{}} />);
    expect(screen.getByText(/Tax included \(United Kingdom\)\. FIXTURE INCLUDED/)).toBeInTheDocument();
  });
  it("makes no statement the founder has not decided: no expiry/rollover, refund, pro-rata, trial, extra-usage price or per-class credit costs", () => {
    render(<PlanCatalogue catalogue={cat({ presentation: "exclusive", jurisdiction: "United Kingdom", wording: "FIXTURE" })} env={{}} />);
    const t = document.body.textContent;
    expect(t).not.toMatch(/expire|roll ?over|carry over|pro-?rata|money.?back|free trial|£\s?3\.33|per day|image\.normal|video\.(normal|premium)/i);
    expect(screen.getAllByText("Not published yet").length).toBeGreaterThanOrEqual(2); // using more, trial
    expect(screen.getByRole("link", { name: "Cancelling" })).toHaveAttribute("href", "https://example.test/cancel");
    expect(screen.getByRole("link", { name: "Refunds" })).toHaveAttribute("href", "https://example.test/refund");
  });
  it("source contains no price, allowance or spend-ceiling constant (the target lives only in the server catalogue)", () => {
    const dir = path.resolve(import.meta.dirname, "..");
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(dir).filter((f) => /\.(jsx?|css)$/.test(f) && !/\.test\./.test(f))) {
      const s = fs.readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/£\s?(99|59|79|149|199)\b|\b60 credits\b|£\s?100\b|3\.33/);
    }
  });
});
