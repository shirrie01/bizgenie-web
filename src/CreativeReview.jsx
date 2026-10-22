import React from "react";
import CreativePreviewCard from "./CreativePreviewCard";
import CreativeReviewPanel from "./CreativeReviewPanel";
import { useCreativePreview } from "./useCreativePreview";

// One variant in review: loads the exact saved creative (read-only), shows it, and gates the
// existing render -> acknowledge -> approve steps behind it. Loading never acknowledges or approves.
export default function CreativeReview({ apiBaseUrl, session, campaign, variant, reviewState, onRender, onAcknowledge, onApprove, onReload }) {
  const creative = useCreativePreview({ apiBaseUrl, session, campaign, variant });
  return (
    <div className="review-layout">
      <CreativePreviewCard variant={variant} preview={creative.preview} status={creative.status} />
      <CreativeReviewPanel variant={variant} state={reviewState} creative={creative} onRetryCreative={creative.retry} onRender={onRender} onAcknowledge={onAcknowledge} onApprove={onApprove} onReload={onReload} />
    </div>
  );
}
