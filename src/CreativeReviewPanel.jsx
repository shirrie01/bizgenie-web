import React from "react";
import { hasCreativeText } from "./CreativePreviewCard";

export const REVIEW_STEPS = [
  { key: "render", label: "Render preview", hint: "See what you are about to approve." },
  { key: "acknowledge", label: "Acknowledge preview", hint: "Confirm you have reviewed it." },
  { key: "approve", label: "Approve", hint: "Record approval. Nothing is published." },
];

const BUSY = ["rendering", "acknowledging", "approving", "reloading"];

// Which step the reviewer is on, derived from the shared review state. An error keeps the step it failed on.
export function currentReviewStep(state) {
  if (state.status === "error") return state.previewId ? 2 : state.receipt ? 1 : 0;
  if (["acknowledged", "approving"].includes(state.status)) return 2;
  if (["rendered", "acknowledging"].includes(state.status)) return 1;
  return 0;
}

const MESSAGES = {
  idle: "Step 1 of 3: render a preview of this content.",
  rendering: "Rendering preview…",
  rendered: "Preview rendered. Step 2 of 3: confirm you have reviewed it.",
  acknowledging: "Recording your acknowledgement…",
  acknowledged: "Preview acknowledged. Step 3 of 3: approve to mark this content approved. Nothing is scheduled or published.",
  approving: "Recording approval…",
  reloading: "Loading the latest campaign…",
};

const titleCase = (value) => String(value).replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Only fields the server actually returned; the receipt confirms what was rendered, it is not a visual preview.
export function receiptFacts(receipt) {
  if (!receipt) return [];
  const where = [receipt.platform, receipt.placement, receipt.format].filter(Boolean).map(titleCase).join(" · ");
  const when = receipt.rendered_at && !Number.isNaN(new Date(receipt.rendered_at).getTime()) ? new Date(receipt.rendered_at).toLocaleString() : "";
  return [
    ["Rendered for", where],
    ["Rendered at", when],
    ["Preview profile", receipt.profile_version ? `Version ${receipt.profile_version}` : ""],
    ["Preview reference", receipt.preview_digest ? String(receipt.preview_digest).slice(0, 12) : ""],
  ].filter(([, value]) => value);
}

export default function CreativeReviewPanel({ variant, state, onRender, onAcknowledge, onApprove, onReload, creative = null, onRetryCreative, mediaSummary = null }) {
  const mine = state.variantId === variant.variant_id;
  const active = mine ? state : { status: "idle", receipt: null, previewId: "", error: "", stale: false };
  const step = currentReviewStep(active);
  // `creative` is the loaded server preview (GET creative-preview). Review cannot start until the exact
  // saved content has loaded; without it (older callers) the variant's own content is used.
  const creativeReady = !creative || creative.status === "ready";
  const serverPreview = creative?.status === "ready" ? creative.preview : null;
  const hasContent = serverPreview
    ? serverPreview.copy_status === "available" || (serverPreview.media || []).length > 0
    : hasCreativeText(variant.current_content);
  const creativeLoading = Boolean(creative) && creative.status === "loading";
  const creativeFailed = Boolean(creative) && creative.status === "error";
  const mediaLoading = Boolean(mediaSummary) && mediaSummary.pending > 0;
  const busy = BUSY.includes(state.status) || creativeLoading || mediaLoading;
  // Without a delivery summary (older callers) any attached media is treated as not shown.
  const mediaNotShown = mediaSummary ? mediaSummary.notDisplayed > 0 : Boolean(serverPreview) && (serverPreview.media || []).some((m) => m.status !== "available");
  const mediaViewed = Boolean(mediaSummary) && mediaSummary.pending === 0 && mediaSummary.notDisplayed === 0 && mediaSummary.displayed > 0;
  const failed = active.status === "error";
  const stale = failed && Boolean(active.stale) && typeof onReload === "function";
  const facts = receiptFacts(active.receipt);

  const actions = [
    { label: "Render preview", busyLabel: "Rendering preview…", run: onRender },
    { label: "Acknowledge preview", busyLabel: "Recording acknowledgement…", run: onAcknowledge },
    { label: "Approve", busyLabel: "Recording approval…", run: onApprove },
  ];
  const action = actions[step];
  const working = mine && busy;

  return (
    <div className="review-panel" role="group" aria-label={`Review ${variant.destination_label || "content"}`}>
      <p><strong>Ready for review</strong></p>
      <ol className="review-steps" aria-label="Review steps">
        {REVIEW_STEPS.map((item, index) => {
          const done = index < step;
          return (
            <li key={item.key} className={done ? "done" : index === step ? "current" : ""} aria-current={index === step ? "step" : undefined}>
              <span className="review-step-label">{index + 1}. {item.label}{done && <span className="visually-hidden"> (complete)</span>}</span>
              <small>{item.hint}</small>
            </li>
          );
        })}
      </ol>
      {creativeLoading ? (
        <p className="notice" role="status">Loading the saved content. Review starts once it has loaded.</p>
      ) : mediaLoading ? (
        <p className="notice" role="status">Loading the attached media. Review starts once it has loaded.</p>
      ) : creativeFailed ? (
        <p className="error" role="alert">{creative.error}</p>
      ) : !hasContent ? (
        <p className="notice">There is no generated copy to review yet. Generate a draft first.</p>
      ) : (
        <p className="notice" role="status">{failed ? "This step did not complete. Your content is unchanged." : MESSAGES[active.status] || MESSAGES.idle}</p>
      )}
      {failed && !creativeFailed && <p className="error" role="alert">{active.error}</p>}
      {failed && !creativeFailed && !active.stale && mediaNotShown && <p className="notice">An attached visual is not available here. If it was removed or its rights were withdrawn, approval may not be possible until it is replaced.</p>}
      {mediaNotShown && <p className="notice">An image or video is attached but couldn’t be displayed here. Acknowledging covers the text and the preview receipt only.</p>}
      {mediaViewed && <p className="notice">You have seen the attached media as saved. It is the original file, not a platform rendering. Acknowledging covers the text, the media shown and the preview receipt.</p>}
      {facts.length > 0 && (
        <dl className="review-receipt" aria-label="Preview receipt">
          {facts.map(([label, value]) => (<div key={label}><dt>{label}</dt><dd>{value}</dd></div>))}
        </dl>
      )}
      {facts.length > 0 && <p className="notice">BizGenie confirmed a preview was rendered for this exact version of the content. The content shown is the version you are approving.</p>}
      <div className="review-actions">
        {creativeFailed ? (
          creative.code === "stale" && typeof onReload === "function"
            ? <button className="secondary" type="button" onClick={() => onReload()}>Reload latest campaign</button>
            : <button className="secondary" type="button" onClick={() => onRetryCreative && onRetryCreative()}>Try again</button>
        ) : stale ? (
          <button className="secondary" type="button" onClick={() => onReload()} disabled={busy}>Reload latest campaign</button>
        ) : (
          <>
            <button className="secondary" type="button" onClick={() => action.run(variant)} disabled={!hasContent || busy || !creativeReady} aria-busy={working || undefined}>
              {working ? action.busyLabel : action.label}
            </button>
            {step > 0 && (
              <button className="secondary" type="button" onClick={() => onRender(variant)} disabled={busy}>Start again with a new preview</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
