// Image and video creative (BG-STUDIO-021-FE). The paid path is the durable quote/confirm flow in generationQuoteClient.js + QuotedGeneration.jsx:
// the legacy direct routes (/customer/generate-image, /customer/generate-video) are NO LONGER CALLED by this app, because the backend's contract
// (bizgenie-api PR #217, docs/studio/BG_STUDIO_020_BACKEND_FRONTEND_CONTRACT.md) makes the quote the only way to a safely reserved, fenced execution.
// What the server owns, and this app therefore does not ask the customer for: the provider and model, the image shape, the video length, and the preview
// profile. What the customer chooses: the brief, and for video the quality class (video.normal or video.premium). A creative can only be made for a content
// item whose format is image or video (the quote refuses anything else with OPERATION_UNSUPPORTED).
// `VITE_CUSTOMER_MEDIA_API` means "the backend operator has activated customer image/video"; it stays off by default and needs `VITE_GENERATION_QUOTE_API`.
import { isGenerationQuoteApiEnabled } from "./generationQuoteClient";

export const isCustomerMediaApiEnabled = (env = import.meta.env) => {
  const raw = env && env.VITE_CUSTOMER_MEDIA_API;
  return typeof raw === "string" && raw.trim().toLowerCase() === "true" && isGenerationQuoteApiEnabled(env);
};
export const KIND_LABEL = { image: "Image", video: "Video" };
export const VIDEO_QUALITIES = ["normal", "premium"];
export const executionClassFor = (format, quality = "normal") => (format === "video" ? `video.${VIDEO_QUALITIES.includes(quality) ? quality : "normal"}` : "image.normal");
export const HYBRID_BLOCKER = "Hybrid (your own photos or videos combined with AI) is not available yet. You can add your own media in Your media, but the step that combines it with AI creative is not finished.";
export const ATTACH_BLOCKER = "It was created and stored privately. Showing it here for your review needs one more step on BizGenie's side (attaching the result to the campaign), which is not built yet, so nothing is shown and nothing is approved.";
export const WRONG_FORMAT = "This item is text. Images and videos are made for image and video items: add one to this campaign first.";
