import { useCallback, useEffect, useRef, useState } from "react";
import { currentRevisionId, fetchCreativePreview } from "./creativePreviewClient";

const EMPTY = { key: "", status: "idle", preview: null, error: "", code: "" };

// State is keyed by campaign, variant, revision AND campaign version, and a response for any other key is
// discarded, so a slow request can never show content for a revision or version the reviewer left.
//
// A version-only change (our own acknowledge or approve bumps it) re-reads the creative under the new version.
// The copy saved for this exact revision is immutable, so it stays on screen while that read runs, and is
// dropped the moment the server refuses it (stale, revoked, signed out) or returns a different revision.
export function useCreativePreview({ apiBaseUrl, session, campaign, variant, enabled = true }) {
  const identity = enabled && campaign && variant ? [campaign.campaign_id, variant.variant_id, currentRevisionId(variant)].join("|") : "";
  const key = identity ? `${identity}|${campaign.version}` : "";
  const [state, setState] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const good = useRef(null); // last preview the server returned: { identity, preview }
  const latest = useRef({ session, campaign, variant });
  latest.current = { session, campaign, variant };

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const kept = good.current && good.current.identity === identity ? good.current.preview : null;
    if (!kept) good.current = null;
    setState({ key, status: kept ? "ready" : "loading", preview: kept, error: "", code: "" });
    (async () => {
      try {
        const preview = await fetchCreativePreview({ apiBaseUrl, ...latest.current, signal: controller.signal });
        if (cancelled) return;
        good.current = { identity, preview };
        setState({ key, status: "ready", preview, error: "", code: "" });
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        good.current = null;
        setState({ key, status: "error", preview: null, error: error.message || "The saved content could not be loaded yet.", code: error.code || "failed" });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [key, attempt, apiBaseUrl, identity]);

  const retry = useCallback(() => { good.current = null; setAttempt((value) => value + 1); }, []);
  if (!key) return { ...EMPTY, retry };
  if (state.key !== key) {
    if (good.current && good.current.identity === identity) return { ...EMPTY, key, status: "ready", preview: good.current.preview, retry };
    return { ...EMPTY, key, status: "loading", retry };
  }
  return { ...state, retry };
}
