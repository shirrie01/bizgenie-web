import React, { useCallback, useMemo, useState } from "react";
import CreativePreviewCard, { canAttemptMedia, normalizePreview } from "./CreativePreviewCard";
import CreativeReviewPanel from "./CreativeReviewPanel";
import MediaPreview from "./MediaPreview";
import { currentRevisionId } from "./creativePreviewClient";
import { useCreativePreview } from "./useCreativePreview";

// One variant in review: loads the exact saved creative (read-only), shows it and any attached media the
// customer is authorised to see, and gates the existing render -> acknowledge -> approve steps behind it.
// Loading or displaying never acknowledges or approves anything.
export default function CreativeReview({ apiBaseUrl, session, campaign, variant, reviewState, onRender, onAcknowledge, onApprove, onReload }) {
  const creative = useCreativePreview({ apiBaseUrl, session, campaign, variant });
  const revisionId = currentRevisionId(variant);
  const [shown, setShown] = useState({});
  // Remembers what was actually displayed for this revision, so a refetch after our own acknowledgement
  // (which bumps the campaign version) does not block Approve behind a second download. A refetch that
  // then fails (for example the asset was revoked) still overrides this and counts as not displayed.
  const [viewed, setViewed] = useState({});
  const onStatus = useCallback((id, status) => {
    setShown((current) => (current[id] === status ? current : { ...current, [id]: status }));
    if (status === "displayed") setViewed((current) => (current[`${revisionId}|${id}`] ? current : { ...current, [`${revisionId}|${id}`]: true }));
  }, [revisionId]);

  const mediaSummary = useMemo(() => {
    if (creative.status !== "ready" || !creative.preview) return null;
    const media = normalizePreview(creative.preview).media;
    const summary = { total: media.length, pending: 0, displayed: 0, notDisplayed: 0 };
    for (const item of media) {
      if (!canAttemptMedia(item)) { summary.notDisplayed += 1; continue; }
      const status = shown[item.id];
      if (status === "error") summary.notDisplayed += 1;
      else if (status === "displayed" || viewed[`${revisionId}|${item.id}`]) summary.displayed += 1;
      else summary.pending += 1;
    }
    return summary;
  }, [creative.status, creative.preview, shown, viewed, revisionId]);

  const renderMedia = useCallback((media, altText) => (
    <MediaPreview apiBaseUrl={apiBaseUrl} session={session} campaign={campaign} variant={variant} media={media} altText={altText} onStatus={onStatus} onReload={onReload} />
  ), [apiBaseUrl, session, campaign, variant, onStatus, onReload]);

  return (
    <div className="review-layout">
      <CreativePreviewCard variant={variant} preview={creative.preview} status={creative.status} renderMedia={renderMedia} />
      <CreativeReviewPanel variant={variant} state={reviewState} creative={creative} mediaSummary={mediaSummary} onRetryCreative={creative.retry} onRender={onRender} onAcknowledge={onAcknowledge} onApprove={onApprove} onReload={onReload} />
    </div>
  );
}
