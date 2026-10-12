import React from "react";

function updateField(brain, section, key, value) {
  if (section === null) return { ...brain, [key]: value };
  return { ...brain, [section]: { ...(brain[section] || {}), [key]: value } };
}

export default function BrandBrainProfile({ brain, onChange, disabled = false }) {
  if (!brain) return null;
  const change = (section, key) => (event) => onChange(updateField(brain, section, key, event.target.value));
  return (
    <div className="brand-profile" aria-label="Brand profile">
      <div className="brand-profile-fields">
        <label htmlFor="brand-name">Brand or business name</label>
        <input id="brand-name" value={brain.name || ""} onChange={change(null, "name")} disabled={disabled} />
        <label htmlFor="brand-description">Business description</label>
        <textarea id="brand-description" rows={4} value={brain.identity?.description || ""} onChange={change("identity", "description")} disabled={disabled} />
        <p className="notice">Describe what the business does and who it serves. A website address alone is not a complete description.</p>
        <label htmlFor="brand-cta">Primary customer action</label>
        <textarea id="brand-cta" rows={4} value={brain.commercial?.primary_cta || ""} onChange={change("commercial", "primary_cta")} disabled={disabled} />
        <p className="notice">What should a customer do next? For example, request a trade account or book a consultation.</p>
      </div>
      <p className="notice">Only the selected brand is editable here. Internal identifiers and approval history are managed by BizGenie.</p>
    </div>
  );
}
export { updateField };
