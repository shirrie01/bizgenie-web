import { useCallback, useEffect, useRef, useState } from "react";
import { currentRevisionId, fetchCreativePreview } from "./creativePreviewClient";

const EMPTY = { key: "", status: "idle", preview: null, error: "", code: "" };

// State is keyed by campaign, variant, revision AND campaign version. A response for any other key is
// discarded, so a slow request can never show content for a revision or version the reviewer left.
export function useCreativePreview({ apiBaseUrl, session, campaign, variant, enabled = true }) {
  const key = enabled && campaign && variant
    ? [campaign.campaign_id, variant.variant_id, currentRevisionId(variant), campaign.version].join("|")
    : "";
  const [state, setState] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ session, campaign, variant });
  latest.current = { session, campaign, variant };

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setState((current) => ({ key, status: "loading", preview: current.key === key ? current.preview : null, error: "", code: "" }));
    (async () => {
      try {
        const preview = await fetchCreativePreview({ apiBaseUrl, ...latest.current, signal: controller.signal });
        if (!cancelled) setState({ key, status: "ready", preview, error: "", code: "" });
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        setState({ key, status: "error", preview: null, error: error.message || "The saved content could not be loaded yet.", code: error.code || "failed" });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [key, attempt, apiBaseUrl]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  if (!key) return { ...EMPTY, retry };
  if (state.key !== key) return { ...EMPTY, key, status: "loading", retry };
  return { ...state, retry };
}
