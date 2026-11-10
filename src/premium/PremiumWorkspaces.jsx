import React, { useEffect, useRef, useState } from "react";
import { sameWorkspace } from "./workspaceClient";

// Workspace chooser (BG-STUDIO-011-FE, API contract G5). Shown when the API says `selection_required`, and from the
// "Workspaces" section for customers who want to switch. Rules:
//  - It lists exactly the workspaces the API says this account may use. Nothing is invented and none is pre-selected.
//  - A workspace is chosen only by an explicit press. The first workspace is never taken silently.
//  - Switching clears the previous workspace's data and unsaved answers, so unsaved answers need an explicit "Discard".
//  - A workspace the API will not select (not approved, or access removed) is shown as unavailable, not hidden.

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" };
const roleLabel = (role) => ROLE[role] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member");
const tail = (id) => String(id).slice(-6);

export default function PremiumWorkspaces({ session, workspaceState, onLoad, onSelect, unsavedAnswers = false, required = false }) {
  const headingRef = useRef(null);
  const [confirming, setConfirming] = useState(null); // the workspace awaiting a "discard unsaved answers" decision
  useEffect(() => { onLoad(); if (headingRef.current) headingRef.current.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = session.status === "ready" ? { tenant_id: session.tenantId, project_id: session.projectId, brand_id: session.brandId } : null;
  const list = workspaceState.workspaces;
  const names = list.map((w) => w.brand_name);
  const duplicate = (w) => names.filter((n) => n === w.brand_name).length > 1;
  const currentListed = current ? list.some((w) => sameWorkspace(w, current)) : false;
  const loading = workspaceState.status === "loading" || workspaceState.status === "idle";

  const choose = (workspace) => {
    if (unsavedAnswers && !confirming) { setConfirming(workspace); return; }
    setConfirming(null);
    onSelect(workspace);
  };

  return (
    <section className="ps-workspaces" aria-labelledby="ps-ws-h">
      <p className="eyebrow">Your workspaces</p>
      <h2 id="ps-ws-h" ref={headingRef} tabIndex={-1}>{required ? "Choose a workspace" : "Switch workspace"}</h2>
      <p className="ps-lede">
        {required
          ? "Your account can use more than one workspace. Choose the one you want to work in. BizGenie will not pick one for you."
          : "Each workspace has its own business profile, setup, campaigns and calendar. Nothing is shared between them."}
      </p>

      {loading && <p role="status" className="ps-loading">Loading your workspaces…</p>}

      {workspaceState.notice && (
        <div className="ps-banner" role="alert">
          <p>{workspaceState.notice}</p>
        </div>
      )}
      {workspaceState.error && (
        <div className="ps-banner" role="alert">
          <p>{workspaceState.error}</p>
          {workspaceState.status === "error" && <button type="button" className="secondary" onClick={onLoad}>Try again</button>}
        </div>
      )}

      {workspaceState.status === "ready" && list.length === 0 && !workspaceState.error && (
        <p className="ps-muted">No workspace is available to your account yet. Set one up from the Set up section.</p>
      )}
      {workspaceState.status === "ready" && list.length === 1 && !required && (
        <p className="ps-muted">You have one workspace. There is nothing to switch to.</p>
      )}
      {workspaceState.status === "ready" && current && !currentListed && (
        <div className="ps-banner" role="alert">
          <p><strong>Your current workspace is no longer available to your account.</strong> Choose another workspace below. Nothing is shown from the old one as saved.</p>
        </div>
      )}

      {workspaceState.status === "ready" && list.length > 0 && (
        <ul className="ps-ws-list" aria-label="Workspaces you can use">
          {list.map((w) => {
            const isCurrent = current && sameWorkspace(w, current);
            const selectable = w.brand_status === "approved";
            const label = w.brand_name || "Unnamed workspace";
            return (
              <li key={`${w.tenant_id}:${w.project_id}:${w.brand_id}`} className={isCurrent ? "current" : ""}>
                <div className="ps-ws-main">
                  <h3>{label}</h3>
                  <p className="ps-ws-meta">
                    {w.project_name ? <span>{w.project_name}</span> : null}
                    <span>{roleLabel(w.membership_role)}</span>
                    {duplicate(w) ? <span>ID …{tail(w.brand_id)}</span> : null}
                  </p>
                  {isCurrent && <p className="ps-ws-flag">Current workspace</p>}
                  {!selectable && <p className="ps-ws-flag warn">Not ready yet (status: {w.brand_status || "unknown"}). It cannot be selected until it is approved.</p>}
                </div>
                <button type="button" className={isCurrent ? "secondary" : "ps-primary"} disabled={!selectable || isCurrent || workspaceState.status === "switching"} aria-label={isCurrent ? `${label} is your current workspace` : `Use ${label}`} onClick={() => choose(w)}>
                  {isCurrent ? "In use" : "Use this workspace"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {confirming && (
        <div className="ps-banner" role="alertdialog" aria-labelledby="ps-ws-confirm-h" aria-describedby="ps-ws-confirm-d">
          <div>
            <p id="ps-ws-confirm-h"><strong>Discard unsaved answers?</strong></p>
            <p id="ps-ws-confirm-d">You have answers in this workspace that are not saved. Switching to {confirming.brand_name || "the other workspace"} will discard them. Saved answers are kept.</p>
          </div>
          <div className="ps-actions">
            <button type="button" className="secondary" onClick={() => setConfirming(null)}>Stay here</button>
            <button type="button" className="ps-primary" onClick={() => choose(confirming)}>Discard and switch</button>
          </div>
        </div>
      )}
      <p className="ps-truth">Choosing a workspace changes only what you see. Nothing is created, scheduled, published or paid for.</p>
    </section>
  );
}
