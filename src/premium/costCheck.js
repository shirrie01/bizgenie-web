import { isGenerationQuoteApiEnabled, requestGenerationQuote } from "./generationQuoteClient";
import { isCreditPreviewApiEnabled, requestCreditPreview } from "./creditPreviewClient";

// One place that decides how the customer sees a cost before a chargeable action (BG-STUDIO-020-FE): a binding server quote when the durable
// quote/confirm backend exists (VITE_GENERATION_QUOTE_API), otherwise the backend's read-only preview (VITE_CREDIT_PREVIEW_API), otherwise nothing.
export const costCheckAvailable = (env = import.meta.env) => isGenerationQuoteApiEnabled(env) || isCreditPreviewApiEnabled(env);

export function requestCostCheck({ apiBaseUrl, accessToken, scope, campaign, variant, executionClass = "text.standard", executionMode = "ai", suppliedAssets = [], env = import.meta.env, fetchImpl }) {
  const extra = fetchImpl ? { fetchImpl } : {};
  if (isGenerationQuoteApiEnabled(env)) return requestGenerationQuote({ apiBaseUrl, accessToken, scope, campaign, variant, executionClass, executionMode, suppliedAssets, ...extra });
  return requestCreditPreview({ apiBaseUrl, accessToken, scope, executionClass, ...extra });
}
