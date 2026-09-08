import { useState } from "react";
import { signInWithPassword, signUpWithPassword } from "./authClient";

export default function AuthPanel({ onAuthenticated }) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [signUpNotice, setSignUpNotice] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSignUpNotice("");
    setStatus("submitting");
    try {
      if (mode === "sign-up") {
        const data = await signUpWithPassword(email, password);
        if (!data.session) {
          setSignUpNotice("Check your inbox to confirm your email, then sign in.");
          setStatus("idle");
          setMode("sign-in");
          return;
        }
      } else {
        await signInWithPassword(email, password);
      }
      setStatus("idle");
      onAuthenticated?.();
    } catch (submitError) {
      setError(submitError.message);
      setStatus("idle");
    }
  }

  return (
    <div className="auth-panel" role="region" aria-label="Sign in">
      <div className="auth-mode-toggle">
        <button
          type="button"
          className={mode === "sign-in" ? "active" : ""}
          onClick={() => {
            setMode("sign-in");
            setError("");
            setSignUpNotice("");
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "sign-up" ? "active" : ""}
          onClick={() => {
            setMode("sign-up");
            setError("");
            setSignUpNotice("");
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting"
            ? "Please wait…"
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      {signUpNotice && <p className="auth-notice" role="status">{signUpNotice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
