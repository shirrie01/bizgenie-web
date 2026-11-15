import { describe, expect, it } from "vitest";
import { genieMessage } from "./genieGuide";

const saved = (step) => ({ version: 2, current_step: step });
describe("genieMessage (deterministic guide, never a live AI claim)", () => {
  it("introduces itself on first visit and reflects genuine saved progress on return", () => {
    expect(genieMessage({ stageId: "welcome" }).say).toMatch(/Genie guide/);
    const back = genieMessage({ stageId: "welcome", onboarding: saved(4), brain: { name: "Fonzo" } }).say;
    expect(back).toMatch(/Welcome back, Fonzo/); expect(back).toMatch(/Channels/); // saved step 4 = Channels panel
    expect(genieMessage({ stageId: "welcome", onboarding: { version: 0, current_step: null } }).say).toMatch(/Hello/); // never "saved" when nothing is
  });
  it("asks the business question and never claims the website is read", () => {
    const m = genieMessage({ stageId: "identity", scopeMissing: true });
    expect(m.say).toMatch(/Tell me a little about your business/i); expect(m.ask).toMatch(/does not read it/i);
    expect(genieMessage({ stageId: "identity", brain: { name: "Aurelle" } }).say).toMatch(/already exists/);
  });
  it("asks for confirmation before an inferred sector becomes the customer's answer", () => {
    const m = genieMessage({ stageId: "about", sector: { key: "leasing", source: "inferred", label: "Vehicle leasing" } });
    expect(m.ask).toMatch(/won.t treat it as your answer until you do/i);
    expect(genieMessage({ stageId: "about", sector: { key: "leasing", source: "customer" } }).ask).toMatch(/Nothing is saved until/i);
  });
  it("reflects the chosen objective, and uses the customer's own words only for known objectives", () => {
    expect(genieMessage({ stageId: "customers", draft: { goal: "Get more customers for my business" } }).say).toMatch(/Get more customers/);
    expect(genieMessage({ stageId: "customers", draft: { goal: "Fill the January diary" } }).say).toMatch(/one thing you most want/i);
  });
  it("is truthful about the Brand Brain loading, failing and absent", () => {
    expect(genieMessage({ stageId: "brain", brainStatus: "loading" }).say).toMatch(/loading/i);
    expect(genieMessage({ stageId: "brain", brainStatus: "error" }).say).toMatch(/won.t show anything as saved/i);
    expect(genieMessage({ stageId: "brain", brainStatus: "ready", brain: { name: "Harbour" } }).say).toMatch(/never confirm anything on your behalf/i);
    expect(genieMessage({ stageId: "brain" }).say).toMatch(/once your workspace has been created/i);
  });
  it("calls channels planning only and the recommendation step unpublished, and never offers connect or publish", () => {
    expect(genieMessage({ stageId: "channels", channels: ["Instagram", "Email"] }).say).toMatch(/Instagram, Email/);
    for (const id of ["channels", "recommendation"]) { const t = JSON.stringify(genieMessage({ stageId: id })); expect(t).toMatch(/Nothing is (generated|posted|connected)|No account is connected/i); expect(t).not.toMatch(/connected to your|has been published|I will publish/i); }
    expect(genieMessage({ stageId: "unknown" }).say).toBe("");
  });
});
