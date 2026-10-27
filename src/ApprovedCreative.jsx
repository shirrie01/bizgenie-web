import React, { useCallback } from "react";
import CreativePreviewCard from "./CreativePreviewCard";
import MediaPreview from "./MediaPreview";
import { useCreativePreview } from "./useCreativePreview";

// The saved creative of an approved, scheduled or published variant (BG-STUDIO-028-FE). Found by real-backend browser acceptance: after approval the card used to show only
// "The image itself can't be shown here yet", because only the review step loaded the exact saved creative. This loads it the same way the review does - the read-only
// creative-preview of the CURRENT revision, and each attached asset through the existing authenticated, revision-scoped delivery - and changes nothing.
export default function ApprovedCreative({ apiBaseUrl, session, campaign, variant, onReload }) {
  const creative = useCreativePreview({ apiBaseUrl, session, campaign, variant });
  const renderMedia = useCallback((media, altText) => (
    <MediaPreview apiBaseUrl={apiBaseUrl} session={session} campaign={campaign} variant={variant} media={media} altText={altText} onReload={onReload} />
  ), [apiBaseUrl, session, campaign, variant, onReload]);
  return <CreativePreviewCard variant={variant} preview={creative.preview} status={creative.status} renderMedia={renderMedia} />;
}
