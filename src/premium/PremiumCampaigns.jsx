import React, { useRef, useState } from "react";

// Campaign management (BG-STUDIO-019-FE, workstream E): open, rename, archive and restore, archived campaigns on request.
// Every action is a real backend command; the result shown is the backend's answer, never a guess. Destructive or disruptive
// actions ask for a reason and are confirmed in place. Archiving is refused by the backend while anything is scheduled or waiting
// for a manual-publication answer, and the page says so in words.
const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function PremiumCampaigns({ list, currentId, admin, onOpen, onRename, onSetArchived, onRefresh }) {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);   // { id, name }
  const [confirming, setConfirming] = useState(null); // { id, archive, reason }
  const trigger = useRef(null);
  const all = list && Array.isArray(list.campaigns) ? list.campaigns.filter((c) => c && c.campaign_id) : [];
  const active = all.filter((c) => !c.archived_at).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  const archived = all.filter((c) => c.archived_at).sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
  const working = admin.status === "working";
  const mine = (id) => admin.id === id;

  async function saveRename(e) {
    e.preventDefault();
    const result = await onRename(editing.id, editing.name);
    if (result && result.ok) setEditing(null);
  }
  async function confirmAction(e) {
    e.preventDefault();
    const result = await onSetArchived(confirming.id, confirming.archive, confirming.reason);
    if (result && result.ok) { setConfirming(null); trigger.current && trigger.current.focus && trigger.current.focus(); }
  }

  const row = (c, isArchived) => (
    <li key={c.campaign_id} className={`ps-camp-row${c.campaign_id === currentId ? " is-open" : ""}`}>
      <div className="ps-camp-main">
        <strong>{c.name || "Untitled campaign"}</strong>
        {c.campaign_id === currentId && <em className="ps-src backend">Open in Campaign Studio</em>}
        {isArchived ? <small>Archived {when(c.archived_at)}</small> : c.updated_at && <small>Updated {when(c.updated_at)}</small>}
      </div>
      {editing && editing.id === c.campaign_id ? (
        <form className="ps-camp-edit" onSubmit={saveRename} aria-label={`Rename ${c.name || "campaign"}`}>
          <label htmlFor={`rename-${c.campaign_id}`}>Campaign name</label>
          <input id={`rename-${c.campaign_id}`} autoFocus value={editing.name} maxLength={200} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="ps-camp-actions"><button type="submit" className="ps-primary" disabled={working || !editing.name.trim()}>{working && mine(c.campaign_id) ? "Saving…" : "Save name"}</button><button type="button" className="secondary" onClick={() => setEditing(null)} disabled={working}>Cancel</button></div>
        </form>
      ) : confirming && confirming.id === c.campaign_id ? (
        <form className="ps-camp-edit" onSubmit={confirmAction} aria-label={`${confirming.archive ? "Archive" : "Restore"} ${c.name || "campaign"}`}>
          <p>{confirming.archive ? "Archive this campaign? It leaves your campaign list and calendar until you restore it. Nothing is deleted." : "Restore this campaign? It returns to your campaign list and calendar."}</p>
          <label htmlFor={`reason-${c.campaign_id}`}>{confirming.archive ? "Why are you archiving it?" : "Why are you restoring it?"}</label>
          <input id={`reason-${c.campaign_id}`} autoFocus value={confirming.reason} maxLength={300} onChange={(e) => setConfirming({ ...confirming, reason: e.target.value })} />
          <div className="ps-camp-actions"><button type="submit" className="ps-primary" disabled={working || !confirming.reason.trim()}>{working && mine(c.campaign_id) ? "Working…" : confirming.archive ? "Archive campaign" : "Restore campaign"}</button><button type="button" className="secondary" onClick={() => { setConfirming(null); trigger.current && trigger.current.focus && trigger.current.focus(); }} disabled={working}>Cancel</button></div>
        </form>
      ) : (
        <div className="ps-camp-actions">
          {!isArchived && <button type="button" className="secondary" onClick={() => onOpen(c.campaign_id)} disabled={working} aria-label={`Open ${c.name || "campaign"} in Campaign Studio`}>Open</button>}
          {!isArchived && <button type="button" className="secondary" onClick={() => setEditing({ id: c.campaign_id, name: c.name || "" })} disabled={working} aria-label={`Rename ${c.name || "campaign"}`}>Rename</button>}
          <button type="button" className="secondary" onClick={(e) => { trigger.current = e.currentTarget; setConfirming({ id: c.campaign_id, archive: !isArchived, reason: "" }); }} disabled={working} aria-label={`${isArchived ? "Restore" : "Archive"} ${c.name || "campaign"}`}>{isArchived ? "Restore" : "Archive"}</button>
        </div>
      )}
      {mine(c.campaign_id) && admin.status === "error" && <p className="error" role="alert">{admin.error}</p>}
    </li>
  );

  return (
    <section className="ps-stage ps-campaigns-manage" aria-labelledby="pcm-h">
      <h2 id="pcm-h">Campaigns</h2>
      <p className="ps-lede">Open, rename, archive and restore your campaigns. Archiving hides a campaign; it does not delete it, and it is refused while something in it is scheduled or waiting for you to record a manual publication.</p>
      <div aria-live="polite" role="status" className="ps-camp-live">{admin.status === "done" && admin.message ? admin.message : ""}</div>
      {list && list.status === "loading" && <p className="ps-loading" role="status">Loading your campaigns…</p>}
      {list && list.status === "error" && <div className="ps-banner" role="alert"><p><strong>Your campaigns could not be loaded.</strong> {list.error}</p><button type="button" className="secondary" onClick={onRefresh}>Try again</button></div>}
      {list && list.status === "ready" && active.length === 0 && <p>You have no active campaigns. Nothing has been created, scheduled or published.</p>}
      {active.length > 0 && <ul className="ps-camp-list ps-camp-manage">{active.map((c) => row(c, false))}</ul>}
      <div className="ps-camp-toggle">
        <button type="button" className="secondary" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide archived campaigns" : `Show archived campaigns (${archived.length})`}</button>
      </div>
      {showArchived && (archived.length === 0 ? <p>No campaigns are archived.</p> : <ul className="ps-camp-list ps-camp-manage" aria-label="Archived campaigns">{archived.map((c) => row(c, true))}</ul>)}
    </section>
  );
}
