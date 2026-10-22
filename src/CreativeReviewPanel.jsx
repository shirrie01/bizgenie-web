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

export default function CreativeReviewPanel({ variant, state, onRender, onAcknowledge, onApprove, onReload }) {
  const mine = state.variantId === variant.variant_id;
  const active = mine ? state : { status: "idle", receipt: null, previewId: "", error: "", stale: false };
  const busy = BUSY.includes(state.status);
  const step = currentReviewStep(active);
  const hasContent = hasCreativeText(variant.current_content);
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
      {!hasContent ? (
        <p className="notice">There is no generated copy to review yet. Generate a draft first.</p>
      ) : (
        <p className="notice" role="status">{failed ? "This step did not complete. Your content is unchanged." : MESSAGES[active.status] || MESSAGES.idle}</p>
      )}
      {failed && <p className="error" role="alert">{active.error}</p>}
      {facts.length > 0 && (
        <dl className="review-receipt" aria-label="Preview receipt">
          {facts.map(([label, value]) => (<div key={label}><dt>{label}</dt><dd>{value}</dd></div>))}
        </dl>
      )}
      {facts.length > 0 && <p className="notice">BizGenie confirmed a preview was rendered for this exact version of the content. The content shown is the version you are approving.</p>}
      <div className="review-actions">
        {stale ? (
          <button className="secondary" type="button" onClick={() => onReload()} disabled={busy}>Reload latest campaign</button>
        ) : (
          <>
            <button className="secondary" type="button" onClick={() => action.run(variant)} disabled={!hasContent || busy} aria-busy={working || undefined}>
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
