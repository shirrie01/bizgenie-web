import React, { useEffect, useState } from "react";
import { isRetryable } from "./mediaPreviewClient";
import { useMediaPreview } from "./useMediaPreview";

// Shows one real attached asset, fetched with the customer session. "displayed" is reported only after the
// browser has actually rendered the bytes (image load / video metadata), never merely because they arrived.
export default function MediaPreview({ apiBaseUrl, session, campaign, variant, media, altText, onStatus, onReload }) {
  const preview = useMediaPreview({ apiBaseUrl, session, campaign, variant, media });
  // The browser's verdict is remembered PER URL, not as a flag that an effect resets when the URL changes. A browser may
  // deliver `load` before React has run the passive effects of the commit that created the element, and a reset effect
  // running afterwards would erase a real "rendered" result and leave the preview "Preparing…" forever.
  const [renderedUrl, setRenderedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const currentUrl = preview.url;
  const rendered = Boolean(currentUrl) && renderedUrl === currentUrl;
  const renderFailed = Boolean(currentUrl) && failedUrl === currentUrl;
  const kind = media.kind;
  const label = (media.role === "primary" ? "Primary " : "Supporting ") + kind;

  useEffect(() => { if (renderFailed) preview.discard(); }, [renderFailed]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = preview.status === "error" || renderFailed ? "error" : preview.status === "ready" && rendered ? "displayed" : "loading";
  useEffect(() => { onStatus?.(media.id, status); }, [media.id, status, onStatus]);

  if (status === "error") {
    const code = renderFailed ? "unsupported" : preview.code;
    const text = renderFailed ? `This ${kind} couldn’t be displayed in your browser.` : preview.error;
    return (
      <div className="media-preview media-error" role="group" aria-label={`${label} unavailable`}>
        <p className="error" role="alert">{text}</p>
        {code === "stale" && typeof onReload === "function" && <button className="secondary" type="button" onClick={() => onReload()}>Reload latest campaign</button>}
        {!renderFailed && isRetryable(code) && <button className="secondary" type="button" onClick={preview.retry} aria-label={`Try again: load ${label.toLowerCase()}`}>Try again</button>}
      </div>
    );
  }

  return (
    <figure className="media-preview" aria-label={label} aria-busy={status === "loading" || undefined}>
      {status === "loading" && <p className="notice" role="status">{preview.status === "ready" ? `Preparing the ${kind}…` : `Loading the ${kind}…`}</p>}
      {preview.status === "ready" && kind === "image" && (
        <img src={preview.url} alt={altText || `${label} attached to this content (no description provided)`} onLoad={() => setRenderedUrl(currentUrl)} onError={() => setFailedUrl(currentUrl)} />
      )}
      {preview.status === "ready" && kind === "video" && (
        <video src={preview.url} controls preload="metadata" playsInline aria-label={altText || `${label} attached to this content (no description provided)`} onLoadedMetadata={() => setRenderedUrl(currentUrl)} onError={() => setFailedUrl(currentUrl)}>
          Your browser can’t play this video.
        </video>
      )}
      {status === "displayed" && <figcaption className="notice">Original {kind} as saved, not how a platform will render it.{kind === "video" ? " It does not play automatically." : ""}</figcaption>}
    </figure>
  );
}
