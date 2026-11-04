// BG-LAUNCH-013: operator-side rehearsal against a PRIVATE Cloud Run revision (tagged URL needing an identity token).
// Cloud Run IAM reads the Google identity token from `Authorization`, but the Studio sends its Supabase session there.
// Cloud Run accepts the identity token in `X-Serverless-Authorization` instead and passes `Authorization` through, so this
// local proxy adds the former and leaves the latter untouched. It listens on 127.0.0.1 only, adds nothing public, changes no IAM,
// and answers preflight itself for the one local Studio origin. Run from an authorised terminal:
//   UPSTREAM=https://<tag>---<service>-<hash>.a.run.app ID_TOKEN="$(gcloud auth print-identity-token)" STUDIO_ORIGIN=http://127.0.0.1:4173 node scripts/staging/operator-proxy.mjs
import http from "node:http";

export function createProxy({ upstream, idToken, studioOrigin, fetchImpl = fetch }) {
  if (!/^https:\/\/[a-z0-9.-]+\.run\.app$/.test(upstream || "")) throw new Error("UPSTREAM must be an https *.run.app origin");
  if (!idToken) throw new Error("ID_TOKEN is required");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(studioOrigin || "")) throw new Error("STUDIO_ORIGIN must be a local http origin");
  const cors = { "access-control-allow-origin": studioOrigin, "access-control-allow-headers": "authorization,content-type,range", "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "Content-Length,Content-Range,Accept-Ranges", vary: "Origin" };
  return http.createServer(async (req, res) => {
    if (req.headers.origin !== studioOrigin) { res.writeHead(403).end(); return; }
    if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
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
