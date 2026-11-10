import React from "react";

// One shared explanation of the four states an answer can be in (BG-STUDIO-011-FE). The wording matches the labels
// the model attaches to each fact, so what the legend says is what the screen shows.
const ITEMS = [
  ["entered", "You entered this", "It is on this screen only. It is not saved until you press Save progress, Save and exit or Save to Brand Brain."],
  ["saved", "Saved", "BizGenie has stored it for this workspace, and confirmed that it did."],
  ["inferred", "Inferred, needs your confirmation", "BizGenie worked it out from your own words. It is a suggestion until you confirm it, and it never counts as your answer."],
  ["missing", "Not provided yet", "Nothing has been entered or saved for this."],
];

export default function ProvenanceLegend({ className = "" }) {
  return (
    <details className={`ps-legend ${className}`.trim()}>
      <summary>How answers are labelled</summary>
      <dl>
        {ITEMS.map(([key, term, text]) => (<div key={key}><dt>{term}</dt><dd>{text}</dd></div>))}
      </dl>
    </details>
  );
}
