import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PremiumBrandStrategy from "./PremiumBrandStrategy";

afterEach(cleanup);
const BRAIN = { brand_id: "b", project_id: "p", name: "Northgate", identity: { description: "We lease cars.", positioning: "Plain-spoken" }, voice: { prohibited_terms: ["cheap", "free"] }, metadata: { version: 3, status: "approved" } };
const open = (label) => screen.getByLabelText(label);

describe("Voice, positioning and strategy", () => {
  it("shows what is saved, one per line, and says it is the customer's own writing, not measured or learned", () => {
    render(<PremiumBrandStrategy brain={BRAIN} onSave={vi.fn()} />);
    expect(open("Positioning")).toHaveValue("Plain-spoken");
    expect(open("Words and phrases to avoid")).toHaveValue("cheap\nfree");
    expect(screen.getByText(/does not check these details, and none of this is a measured result or an insight learned from your performance/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save voice and strategy/i })).toBeDisabled();
  });

  it("sends only the fields that were changed, as typed values (lines become a list), and says what was saved", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<PremiumBrandStrategy brain={BRAIN} onSave={onSave} />);
    fireEvent.change(open("Tone of voice"), { target: { value: "  warm and direct " } });
    fireEvent.change(open("Fonts"), { target: { value: "Fraunces\n\n Inter " } });
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ extended: { tone: "warm and direct", fonts: ["Fraunces", "Inter"] } });
    expect(await screen.findByText(/only the details you changed here were sent/i)).toBeInTheDocument();
  });

  it("never sends the business name or description, and sends nothing when nothing changed", () => {
    const onSave = vi.fn();
    render(<PremiumBrandStrategy brain={BRAIN} onSave={onSave} />);
    expect(screen.queryByLabelText(/business name|what the business does/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("explains a removal before it happens, and refuses values the backend would reject", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    render(<PremiumBrandStrategy brain={BRAIN} onSave={onSave} />);
    fireEvent.change(open("Positioning"), { target: { value: "" } });
    expect(screen.getByText(/saving will remove: positioning/i)).toBeInTheDocument();
    fireEvent.change(open("Brand colours"), { target: { value: Array.from({ length: 21 }, (_, i) => `c${i}`).join("\n") } });
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(await screen.findByText(/brand colours can have at most 20 lines/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps what was typed when a save is refused or not confirmed, and says which", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, unconfirmed: true, message: "Save not confirmed — your changes may already have been saved." }).mockResolvedValueOnce({ ok: false, conflict: true, message: "Your Brand Brain was changed somewhere else, so this save was not applied. Nothing was overwritten.", reloaded: true });
    render(<PremiumBrandStrategy brain={BRAIN} onSave={onSave} />);
    fireEvent.change(open("Mission"), { target: { value: "Keep businesses moving" } });
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(await screen.findByText(/save not confirmed/i)).toBeInTheDocument();
    expect(open("Mission")).toHaveValue("Keep businesses moving");
    fireEvent.click(screen.getByRole("button", { name: /save voice and strategy/i }));
    expect(await screen.findByText(/changed somewhere else/i)).toBeInTheDocument();
    expect(open("Mission")).toHaveValue("Keep businesses moving");
  });

  it("untouched fields follow a newly stored Brand Brain; a field being edited keeps what was typed", () => {
    const { rerender } = render(<PremiumBrandStrategy brain={BRAIN} onSave={vi.fn()} />);
    fireEvent.change(open("Mission"), { target: { value: "My draft" } });
    rerender(<PremiumBrandStrategy brain={{ ...BRAIN, identity: { ...BRAIN.identity, positioning: "Changed elsewhere", mission: "Stored mission" } }} onSave={vi.fn()} />);
    expect(open("Positioning")).toHaveValue("Changed elsewhere");
    expect(open("Mission")).toHaveValue("My draft");
  });
});
