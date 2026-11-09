// Idempotency keys must be 1-128 characters of [A-Za-z0-9._:-] (bizgenie-api `identifier`). The readable
// campaign/variant/revision scope is 145-160 characters once real UUIDs are used, so the API rejected every
// preview, acknowledgement, approval and manual-publication request. The scope is therefore hashed: the key stays
// deterministic (a retry of the same operation on the same revision reuses it) and unique per scope and operation.
export async function operationKey(campaign, variant, revisionId, operation) {
  const scope = `campaign:${campaign.campaign_id}:variant:${variant.variant_id}:revision:${revisionId}:${operation}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `op:${operation}:${hex}`;
}
