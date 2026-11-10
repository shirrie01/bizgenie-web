// Monetary stop for the real-provider run (BG-LAUNCH-006). Credits are not money, so the harness also tracks WORST-CASE dollars: before every paid job it adds that job's worst-case
// price to what has already been committed and refuses the job if the total would exceed the founder-approved USD figure. This is a guard inside the harness only; it is not a
// provider-side limit and does not see what the providers actually bill (compare their consoles afterwards).
// Defaults are deliberately pessimistic: the VIDEO worst case is Veo 3.1 (not Fast) WITH audio at 720p, $0.40 per second, over the quoted duration even though the code requests
// Fast without audio (listed at $0.08 per second on Google's pricing page, read 2026-11-01, unit "1 count" read as seconds); the IMAGE worst case is a deliberately generous $0.25.
export const DEFAULT_WORST_CASE = Object.freeze({ videoPerSecondUsd: 0.4, imageUsd: 0.25 });

export function parseUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
}

export function createSpendGuard({ approvedUsd, videoSeconds = 4, worstCase = DEFAULT_WORST_CASE } = {}) {
  const approved = parseUsd(approvedUsd);
  if (approved === null) throw new TypeError("An approved USD ceiling is required");
  let committed = 0; const decisions = [];
  const price = (executionClass) => {
    if (executionClass === "image.normal") return worstCase.imageUsd;
    if (executionClass === "video.normal" || executionClass === "video.premium") return Math.round(worstCase.videoPerSecondUsd * videoSeconds * 100) / 100;
    return null; // anything else (text, hybrid, unknown) is not part of the approved run
  };
  return Object.freeze({
    approved, price,
    // Returns { allow, reason, committed, projected }. Unknown job kinds are refused: only the approved run's kinds may spend.
    admit(executionClass) {
      const cost = price(executionClass);
      if (cost === null) { const d = { allow: false, reason: "NOT_PART_OF_THE_APPROVED_RUN", committed, projected: committed }; decisions.push(d); return d; }
      const projected = Math.round((committed + cost) * 100) / 100;
      if (projected > approved) { const d = { allow: false, reason: "WOULD_EXCEED_APPROVED_USD", committed, projected }; decisions.push(d); return d; }
      committed = projected; const d = { allow: true, reason: "OK", committed, projected }; decisions.push(d); return d;
    },
    snapshot: () => ({ approved, committed, decisions: decisions.length }),
  });
}
