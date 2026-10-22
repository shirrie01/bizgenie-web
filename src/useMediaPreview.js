import { useCallback, useEffect, useRef, useState } from "react";
import { currentRevisionId } from "./creativePreviewClient";
import { fetchMediaPreview } from "./mediaPreviewClient";

const EMPTY = { key: "", status: "idle", url: "", mime: "", bytes: 0, error: "", code: "" };

// One asset on one revision of one campaign version. Requests are keyed by campaign, variant, revision,
// asset AND version, and a response for a key the reviewer has left is dropped.
//
// When only the version changes (our own acknowledge or approve bumps it) the bytes already displayed for
// this exact revision and asset are reused, but never without the server's say-so: a HEAD under the NEW
// version re-checks rights, version, revision and asset binding. If that HEAD fails, or reports a different
// type or size, the held bytes are discarded at once (and refetched only when the server still authorises them).
export function useMediaPreview({ apiBaseUrl, session, campaign, variant, media, enabled = true }) {
  const identity = enabled && campaign && variant && media ? [campaign.campaign_id, variant.variant_id, currentRevisionId(variant), media.id].join("|") : "";
  const key = identity ? `${identity}|${campaign.version}` : "";
  const [state, setState] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);
  const held = useRef(null); // { identity, url, mime, bytes }
  const latest = useRef({ session, campaign, variant, media });
  latest.current = { session, campaign, variant, media };

  const release = useCallback(() => {
    if (held.current) { URL.revokeObjectURL(held.current.url); held.current = null; }
  }, []);

  useEffect(() => () => release(), [release]);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const args = () => ({ apiBaseUrl, ...latest.current, signal: controller.signal });
    const fail = (error) => {
      release();
      setState({ ...EMPTY, key, status: "error", error: error.message || "The media couldn’t be loaded.", code: error.code || "failed" });
    };
    const fullFetch = async () => {
      setState({ ...EMPTY, key, status: "loading" });
      const result = await fetchMediaPreview(args());
      if (cancelled) return;
      release();
      held.current = { identity, url: URL.createObjectURL(result.blob), mime: result.mime, bytes: result.bytes };
      setState({ key, status: "ready", url: held.current.url, mime: result.mime, bytes: result.bytes, error: "", code: "" });
    };
    (async () => {
      try {
        const kept = held.current;
        if (kept && kept.identity !== identity) release();
        if (held.current && held.current.identity === identity) {
          setState({ key, status: "ready", url: held.current.url, mime: held.current.mime, bytes: held.current.bytes, error: "", code: "" });
          const head = await fetchMediaPreview({ ...args(), headOnly: true });
          if (cancelled) return;
          if (head.mime === held.current.mime && head.bytes === held.current.bytes) return;
          release();
        }
        await fullFetch();
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        fail(error);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [key, attempt, apiBaseUrl, identity, release]);

  const retry = useCallback(() => { release(); setAttempt((value) => value + 1); }, [release]);
  // The browser rejected bytes it received (unsupported codec, corrupt file): drop them immediately.
  const discard = useCallback(() => release(), [release]);
  if (!key) return { ...EMPTY, retry, discard };
  if (state.key !== key) {
    // First render after a version-only change: keep showing the held bytes while the HEAD revalidates.
    if (held.current && held.current.identity === identity) return { ...EMPTY, key, status: "ready", url: held.current.url, mime: held.current.mime, bytes: held.current.bytes, retry, discard };
    return { ...EMPTY, key, status: "loading", retry, discard };
  }
  return { ...state, retry, discard };
}
