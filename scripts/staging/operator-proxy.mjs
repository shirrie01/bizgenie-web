// BG-LAUNCH-013: operator-side rehearsal against a PRIVATE Cloud Run revision (tagged URL needing an identity token).
// Cloud Run IAM reads the Google identity token from `Authorization`, but the Studio sends its Supabase session there.
// Cloud Run accepts the identity token in `X-Serverless-Authorization` instead and passes `Authorization` through, so this
// local proxy (staging service only; /customer/ paths only; a Supabase Authorization is required; no DELETE; nothing logged except the host) adds the former and leaves the latter untouched. It listens on 127.0.0.1 only, adds nothing public, changes no IAM,
// and answers preflight itself for the one local Studio origin. Run from an authorised terminal:
//   UPSTREAM=https://<tag>---bizgenie-api-staging-<hash>-<region>.a.run.app ID_TOKEN="$(gcloud auth print-identity-token)" STUDIO_ORIGIN=http://127.0.0.1:4173 node scripts/staging/operator-proxy.mjs
import http from "node:http";

const STAGING_UPSTREAM = /^https:\/\/(?:[a-z0-9-]+---)?bizgenie-api-staging-[a-z0-9]+-[a-z0-9]+\.a\.run\.app$/;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"]); // the API's own CORS list: DELETE is not forwarded

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// BG-LAUNCH-ACCEPTANCE-03 (R2): two OPT-IN safeguards, off by default so existing operator workflows are unchanged.
//   pinTag   : the upstream must be the tag URL of exactly that revision tag (https://<pinTag>---bizgenie-api-staging-...), so the untagged 100 %-serving URL is refused.
//   readOnly : only GET, HEAD and OPTIONS are forwarded; and every response states whether the PROXY or the UPSTREAM produced it (x-operator-proxy-response),
//              so a proxy-generated 401/403/404/405 can never be mistaken for the API's own status.
export function createProxy({ upstream, idToken, studioOrigin, fetchImpl = fetch, pinTag = "", readOnly = false }) {
  if (pinTag) {
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(pinTag)) throw new Error("PIN_TAG must be a Cloud Run revision tag");
    if (!upstream || !upstream.startsWith(`https://${pinTag}---bizgenie-api-staging-`)) throw new Error(`UPSTREAM must be the ${pinTag}--- tag URL of bizgenie-api-staging; the untagged serving URL is refused`);
  }
  // Only the staging API service (optionally through a revision tag). A production service, or any other host, is refused before anything starts.
  if (!STAGING_UPSTREAM.test(upstream || "") || /prod/i.test(upstream)) throw new Error("UPSTREAM must be the bizgenie-api-staging Cloud Run service (a tag URL of it is fine); anything else is refused");
  if (!idToken) throw new Error("ID_TOKEN is required");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(studioOrigin || "")) throw new Error("STUDIO_ORIGIN must be a local http origin");
  const cors = { "access-control-allow-origin": studioOrigin, "access-control-allow-headers": "authorization,content-type,range", "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "Content-Length,Content-Range,Accept-Ranges", vary: "Origin" };
  const mark = (h, who) => (readOnly ? { ...h, "x-operator-proxy-response": who } : h);
  const allowed = readOnly ? READ_ONLY_METHODS : METHODS;
  return http.createServer(async (req, res) => {
    if (req.headers.origin !== studioOrigin) { res.writeHead(403, mark({}, "proxy")).end(); return; }
    if (!allowed.has(req.method)) { res.writeHead(405, mark(cors, "proxy")).end(); return; }
    if (req.method === "OPTIONS") { res.writeHead(204, mark(cors, "proxy")).end(); return; }
    if (!/^\/customer\//.test(req.url || "") || !req.headers.authorization) { res.writeHead(req.headers.authorization ? 404 : 401, mark(cors, "proxy")).end(); return; }
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = { "x-serverless-authorization": `Bearer ${idToken}` };
      for (const k of ["authorization", "content-type", "range"]) if (req.headers[k]) headers[k] = req.headers[k];
      const r = await fetchImpl(upstream + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "manual" });
      const out = mark({ ...cors }, "upstream"); for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) if (r.headers.get(k)) out[k] = r.headers.get(k);
      res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
    } catch { res.writeHead(502, mark(cors, "proxy")).end(JSON.stringify({ error: "upstream unreachable" })); }
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r2 = process.env.ACCEPTANCE === "r2";
  if (r2 && (!process.env.PIN_TAG || process.env.READ_ONLY !== "1")) { console.error("ACCEPTANCE=r2 requires PIN_TAG=<revision tag> and READ_ONLY=1"); process.exit(2); }
  const s = createProxy({ upstream: process.env.UPSTREAM, idToken: process.env.ID_TOKEN, studioOrigin: process.env.STUDIO_ORIGIN, pinTag: process.env.PIN_TAG || "", readOnly: process.env.READ_ONLY === "1" });
  s.listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log(`operator proxy on http://127.0.0.1:${process.env.PORT || 8787} -> ${process.env.UPSTREAM} (token not logged)`));
}
