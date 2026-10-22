import { useCallback, useEffect, useRef, useState } from "react";
import { currentRevisionId } from "./creativePreviewClient";
import { fetchMediaPreview } from "./mediaPreviewClient";

const EMPTY = { key: "", status: "idle", url: "", mime: "", bytes: 0, error: "", code: "" };

// One asset on one revision of one campaign version. Blob URLs are revoked on key change, error and
// unmount, and a response for a key the reviewer has left is dropped.
export function useMediaPreview({ apiBaseUrl, session, campaign, variant, media, enabled = true }) {
  const key = enabled && campaign && variant && media
    ? [campaign.campaign_id, variant.variant_id, currentRevisionId(variant), media.id, campaign.version].join("|")
    : "";
  const [state, setState] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const urlRef = useRef("");
  const latest = useRef({ session, campaign, variant, media });
  latest.current = { session, campaign, variant, media };

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    setState({ ...EMPTY, key, status: "loading" });
    (async () => {
      try {
        const result = await fetchMediaPreview({ apiBaseUrl, ...latest.current, signal: controller.signal });
        if (cancelled) return;
        urlRef.current = URL.createObjectURL(result.blob);
        setState({ key, status: "ready", url: urlRef.current, mime: result.mime, bytes: result.bytes, error: "", code: "" });
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        setState({ ...EMPTY, key, status: "error", error: error.message || "The media couldn’t be loaded.", code: error.code || "failed" });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
    };
  }, [key, attempt, apiBaseUrl]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  // The browser rejected bytes it received (unsupported codec, corrupt file): drop them immediately.
  const discard = useCallback(() => { if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; } }, []);
  if (!key) return { ...EMPTY, retry, discard };
  if (state.key !== key) return { ...EMPTY, key, status: "loading", retry, discard };
  return { ...state, retry, discard };
}
