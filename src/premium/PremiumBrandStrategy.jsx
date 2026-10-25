import React, { useEffect, useRef, useState } from "react";
import { EXTENDED_GROUPS, changedExtended, describeBrainFailure, extendedFormValues, validateExtended } from "./brainClient";

// Voice, positioning, audience insight, offer and claims, competitors and visual style (BG-STUDIO-018-FE).
// These are details the customer writes and saves to their own Brand Brain through the same path as every other Brand Brain edit:
// the latest stored version is read first and only the fields changed here are applied (App.premiumSaveBrain). They never include the
// business name or description, so the owner-only rule (DEC-021/022) is unaffected and members may edit them. Nothing here is
// generated, scored or verified by BizGenie, and no Learning Brain insight is claimed.
export default function PremiumBrandStrategy({ brain, onSave }) {
  const stored = extendedFormValues(brain);
  const [values, setValues] = useState(stored);
  const [baseline, setBaseline] = useState(stored);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // When the stored Brand Brain changes (a save, a reload), untouched fields follow it; fields being edited keep what was typed.
  useEffect(() => {
    const next = extendedFormValues(brain);
    setValues((cur) => Object.fromEntries(Object.keys(next).map((k) => [k, cur[k] === baseline[k] ? next[k] : cur[k]])));
    setBaseline(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brain]);

  const changed = changedExtended(values, baseline);
  const ids = Object.keys(changed);
  const removing = EXTENDED_GROUPS.flatMap((g) => g.fields).filter((f) => ids.includes(f.id) && (Array.isArray(changed[f.id]) ? changed[f.id].length === 0 : !changed[f.id]) && baseline[f.id]).map((f) => f.label);

  async function save() {
    if (inFlight.current || ids.length === 0) return;
    const found = validateExtended(values, ids);
    setErrors(found);
    if (Object.keys(found).length) return;
    inFlight.current = true; setBusy(true); setMessage({ kind: "", text: "" });
    try {
      const result = await onSave({ extended: changed });
      if (result.ok) setMessage({ kind: "ok", text: "Saved to your Brand Brain. Only the details you changed here were sent; everything else is kept as it is saved now." });
      else setMessage(describeBrainFailure(result));
    } finally { inFlight.current = false; setBusy(false); }
  }

  const set = (id) => (e) => setValues((cur) => ({ ...cur, [id]: e.target.value }));
  return (
    <section className="ps-strategy" aria-labelledby="pbs-h">
      <h3 id="pbs-h">Voice, positioning and strategy</h3>
      <p className="ps-hint">Written by you and kept in your Brand Brain, where BizGenie uses it as context. BizGenie does not check these details, and none of this is a measured result or an insight learned from your performance.</p>
      {EXTENDED_GROUPS.map((g) => (
        <details key={g.id} className="ps-strategy-group" open={g.fields.some((f) => values[f.id] !== baseline[f.id])}>
          <summary>{g.title}{g.fields.some((f) => baseline[f.id]) ? ` (${g.fields.filter((f) => baseline[f.id]).length} saved)` : ""}</summary>
          {g.fields.map((f) => (
            <div className="ps-field" key={f.id}>
              <label htmlFor={`pbs-${f.id}`}>{f.label}</label>
              <textarea id={`pbs-${f.id}`} rows={f.kind === "prose" ? 3 : 4} value={values[f.id]} onChange={set(f.id)} aria-describedby={f.hint ? `pbs-${f.id}-hint` : undefined} aria-invalid={errors[f.id] ? "true" : undefined} />
              {errors[f.id] && <p className="error" role="alert">{errors[f.id]}</p>}
              {f.hint && <p className="ps-hint" id={`pbs-${f.id}-hint`}>{f.hint}</p>}
            </div>
          ))}
        </details>
      ))}
      {removing.length > 0 && <p className="ps-truth">Saving will remove: {removing.join(", ")}.</p>}
      <button type="button" className="ps-primary" onClick={save} disabled={busy || ids.length === 0}>{busy ? "Saving…" : "Save voice and strategy"}</button>
      {ids.length === 0 && !busy && <p className="ps-hint">Change a detail above to save it.</p>}
      {message.text && (
        <div className={message.kind === "ok" ? "ps-ok" : message.kind === "unconfirmed" ? "ps-warn" : "error"} role={message.kind === "ok" ? "status" : "alert"} data-kind={message.kind}>
          <p>{message.text}</p>
        </div>
      )}
    </section>
  );
}
