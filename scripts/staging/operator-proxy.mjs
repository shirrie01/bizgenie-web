// BG-LAUNCH-013: operator-side rehearsal against a PRIVATE Cloud Run revision (tagged URL needing an identity token).
// Cloud Run IAM reads the Google identity token from `Authorization`, but the Studio sends its Supabase session there.
// Cloud Run accepts the identity token in `X-Serverless-Authorization` instead and passes `Authorization` through, so this
// local proxy (staging service only; /customer/ paths only; a Supabase Authorization is required; no DELETE; nothing logged except the host) adds the former and leaves the latter untouched. It listens on 127.0.0.1 only, adds nothing public, changes no IAM,
// and answers preflight itself for the one local Studio origin. Run from an authorised terminal:
//   UPSTREAM=https://<tag>---bizgenie-api-staging-<hash>-<region>.a.run.app ID_TOKEN="$(gcloud auth print-identity-token)" STUDIO_ORIGIN=http://127.0.0.1:4173 node scripts/staging/operator-proxy.mjs
import http from "node:http";

const STAGING_UPSTREAM = /^https:\/\/(?:[a-z0-9-]+---)?bizgenie-api-staging-[a-z0-9]+-[a-z0-9]+\.a\.run\.app$/;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"]); // the API's own CORS list: DELETE is not forwarded

export function createProxy({ upstream, idToken, studioOrigin, fetchImpl = fetch }) {
  // Only the staging API service (optionally through a revision tag). A production service, or any other host, is refused before anything starts.
  if (!STAGING_UPSTREAM.test(upstream || "") || /prod/i.test(upstream)) throw new Error("UPSTREAM must be the bizgenie-api-staging Cloud Run service (a tag URL of it is fine); anything else is refused");
  if (!idToken) throw new Error("ID_TOKEN is required");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(studioOrigin || "")) throw new Error("STUDIO_ORIGIN must be a local http origin");
  const cors = { "access-control-allow-origin": studioOrigin, "access-control-allow-headers": "authorization,content-type,range", "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,OPTIONS", "access-control-expose-headers": "Content-Length,Content-Range,Accept-Ranges", vary: "Origin" };
  return http.createServer(async (req, res) => {
    if (req.headers.origin !== studioOrigin) { res.writeHead(403).end(); return; }
    if (!METHODS.has(req.method)) { res.writeHead(405, cors).end(); return; }
    if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
    if (!/^\/customer\//.test(req.url || "") || !req.headers.authorization) { res.writeHead(req.headers.authorization ? 404 : 401, cors).end(); return; }
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = { "x-serverless-authorization": `Bearer ${idToken}` };
      for (const k of ["authorization", "content-type", "range"]) if (req.headers[k]) headers[k] = req.headers[k];
      const r = await fetchImpl(upstream + req.url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "manual" });
      const out = { ...cors }; for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) if (r.headers.get(k)) out[k] = r.headers.get(k);
      res.writeHead(r.status, out).end(Buffer.from(await r.arrayBuffer()));
    } catch { res.writeHead(502, cors).end(JSON.stringify({ error: "upstream unreachable" })); }
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = createProxy({ upstream: process.env.UPSTREAM, idToken: process.env.ID_TOKEN, studioOrigin: process.env.STUDIO_ORIGIN });
  s.listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log(`operator proxy on http://127.0.0.1:${process.env.PORT || 8787} -> ${process.env.UPSTREAM} (token not logged)`));
}
