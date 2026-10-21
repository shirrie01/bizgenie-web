import React from "react";

export const REVIEW_STEPS = [
  { key: "render", label: "Render preview", hint: "See what you are about to approve." },
  { key: "acknowledge", label: "Acknowledge preview", hint: "Confirm you have reviewed it." },
  { key: "approve", label: "Approve", hint: "Record approval. Nothing is published." },
];

const BUSY = ["rendering", "acknowledging", "approving"];

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
};

export default function CreativeReviewPanel({ variant, state, onRender, onAcknowledge, onApprove }) {
  const mine = state.variantId === variant.variant_id;
  const active = mine ? state : { status: "idle", receipt: null, previewId: "", error: "" };
  const busy = BUSY.includes(state.status);
  const step = currentReviewStep(active);
  const hasContent = Boolean(variant.current_content);
  const failed = active.status === "error";

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
        <p className="notice" role="status">{failed ? "This step did not complete. Your content is unchanged; you can try again." : MESSAGES[active.status] || MESSAGES.idle}</p>
      )}
      <div className="review-actions">
        <button className="secondary" type="button" onClick={() => action.run(variant)} disabled={!hasContent || busy} aria-busy={working || undefined}>
          {working ? action.busyLabel : action.label}
        </button>
        {step > 0 && (
          <button className="secondary" type="button" onClick={() => onRender(variant)} disabled={busy}>Start again with a new preview</button>
        )}
      </div>
      {failed && <p className="error" role="alert">{active.error}</p>}
    </div>
  );
}
