import {useEffect,useRef,useState} from "react";
const fields=[['title','Title',200],['body','Post copy and call to action',32000],['caption','Caption',8000],['alt_text','Accessibility description',2000]];
export default function CopyRevisionEditor({enabled=false,readOnly=false,campaign,variant,onSave,onReload}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState({}),[base,setBase]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 if(!enabled||readOnly||!variant.current_revision_id||!['draft','review','approved','scheduled'].includes(variant.workflow))return null;
 const stale=base&&(base.version!==campaign.version||base.revision!==variant.current_revision_id);
 const start=()=>{setDraft(Object.fromEntries(fields.map(([key])=>[key,variant.current_content?.[key]||''])));setBase({version:campaign.version,revision:variant.current_revision_id});setError('');setMessage('');setOpen(true);};
 const save=async e=>{e.preventDefault();if(busy||stale)return;setBusy(true);setError('');try{const result=await onSave(Object.fromEntries(fields.map(([key])=>[key,draft[key]||null])),base);if(alive.current&&result){setOpen(false);setMessage('Copy saved as a new draft. Review and approve this version before scheduling or publishing.');}}catch(err){if(alive.current)setError(err.message||'The save could not be confirmed. Your corrections are still here.');}finally{if(alive.current)setBusy(false);}};
 return <section className="ps-creative" aria-label="Correct draft copy">
  {!open?<button type="button" className="secondary" onClick={start}>Correct copy / CTA</button>:<form onSubmit={save} aria-label="Save corrected copy">
   <p>Saving keeps the previous version and creates a new draft. Any approval and planned time for the old version will be removed. Media is unchanged.</p>
   {fields.map(([key,label,max])=><div key={key}><label htmlFor={`copy-${variant.variant_id}-${key}`}>{label}</label><textarea id={`copy-${variant.variant_id}-${key}`} value={draft[key]||''} maxLength={max} disabled={busy} onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))}/></div>)}
   {stale&&<p role="alert">The saved campaign changed. Your corrections are still here; cancel and reload the saved copy before editing again.</p>}
   {error&&<p role="alert">{error}</p>}
   <button type="submit" disabled={busy||stale}>{busy?'Saving…':'Save new draft'}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button>
   {onReload&&<button type="button" disabled={busy} onClick={onReload}>Reload saved campaign</button>}
  </form>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
