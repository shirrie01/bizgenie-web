import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("../authClient", () => ({ signUpWithPassword: vi.fn(), signInWithPassword: vi.fn() }));
import { signUpWithPassword, signInWithPassword } from "../authClient";
import AuthPanel from "../AuthPanel";

const fill = (email = "new@example.test", password = "correct horse 9") => {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
};
const submit = () => fireEvent.submit(screen.getByLabelText(/email/i).closest("form"));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

// BG-LAUNCH-015: sign-up and email-confirmation states (MOCKED Supabase; real Supabase behaviour is not proven here).
describe("AuthPanel sign-up states", () => {
  it("confirmation required: says to confirm, tells existing customers to sign in, shows sign-in, and does not authenticate", async () => {
    signUpWithPassword.mockResolvedValue({ user: { identities: [{}] }, session: null });
    const done = vi.fn(); render(<AuthPanel onAuthenticated={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" })); fill(); submit();
    const note = await screen.findByRole("status"); expect(note).toHaveTextContent(/Check your inbox to confirm your email, then sign in/);
    expect(note).toHaveTextContent(/already have an account with this email, sign in instead/);
    expect(done).not.toHaveBeenCalled(); expect(screen.getAllByRole("button", { name: "Sign in" })[0]).toHaveClass("active");
  });
  it("an address that is already registered gets the SAME words (the form never reveals which addresses have accounts)", async () => {
    signUpWithPassword.mockResolvedValueOnce({ user: { identities: [{}] }, session: null }).mockResolvedValueOnce({ user: { identities: [] }, session: null });
    render(<AuthPanel onAuthenticated={vi.fn()} />);
    const texts = [];
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Create account" })); fill(); submit();
      texts.push((await screen.findByRole("status")).textContent);
    }
    expect(texts[0]).toBe(texts[1]);
  });
  it("confirmation off: a session is returned and the customer continues straight in", async () => {
    signUpWithPassword.mockResolvedValue({ user: {}, session: { access_token: "x" } });
    const done = vi.fn(); render(<AuthPanel onAuthenticated={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" })); fill(); submit();
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1)); expect(screen.queryByRole("status")).toBeNull();
  });
  it("a refusal is shown as the safe sentence the auth client produced, with nothing authenticated", async () => {
    signUpWithPassword.mockRejectedValue(new Error("Choose a password with at least 8 characters."));
    const done = vi.fn(); render(<AuthPanel onAuthenticated={done} />);
    fireEvent.click(screen.getByRole("button", { name: "Create account" })); fill("a@b.test", "short"); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/); expect(done).not.toHaveBeenCalled();
  });
  it("signing in before confirming the email is explained, not a generic failure", async () => {
    signInWithPassword.mockRejectedValue(new Error("Check your inbox to confirm your email before signing in."));
    render(<AuthPanel onAuthenticated={vi.fn()} />); fill(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/confirm your email before signing in/);
  });
});
