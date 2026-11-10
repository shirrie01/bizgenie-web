import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { resolveApiConfig } from "./apiConfig";

// A hosted build that does not know where its API is must say so, not fall back to the visitor's own machine (BG-017C-05B).
const api = resolveApiConfig(import.meta.env.VITE_BIZGENIE_API_URL);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {api.ok ? <App /> : (
      <main className="shell">
        <section className="auth-panel" role="alert" aria-label="Setup problem">
          <h1>BizGenie isn&rsquo;t set up for this address yet</h1>
          <p>This page can&rsquo;t reach BizGenie, so nothing was sent and nothing was changed. Please contact support and tell them this address.</p>
        </section>
      </main>
    )}
  </StrictMode>
);
