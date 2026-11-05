// Local preview server for the built site (DEV ONLY): serves site-dist/ with the REFERENCE security headers (including the strict CSP, so the site is
// tested under the policy it will ship with) and starts the in-memory reference lead stub on a second origin, so cross-origin CORS is exercised too.
//   SITE_PORT (default 4300)  STUB_PORT (default 4301)  SITE_OUT (default site-dist)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLeadStub } from "./lead-stub.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", process.env.SITE_OUT || "site-dist");
const sitePort = Number(process.env.SITE_PORT || 4300);
const stubPort = Number(process.env.STUB_PORT || 4301);
const headers = JSON.parse(fs.readFileSync(path.join(root, "headers.reference.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json" };

const stub = createLeadStub({ allowedOrigin: `http://127.0.0.1:${sitePort}`, rateLimit: { max: Number(process.env.STUB_RATE_MAX || 1000), windowMs: 15 * 60 * 1000 } });
await stub.listen(stubPort);

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(root, rel);
  const inside = file.startsWith(root + path.sep);
  const base = {
    "content-security-policy": headers["Content-Security-Policy"], "x-content-type-options": "nosniff", "referrer-policy": headers["Referrer-Policy"],
    "permissions-policy": headers["Permissions-Policy"], "cache-control": "no-cache",
  };
  if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { ...base, "content-type": TYPES[".html"] });
    return res.end(fs.readFileSync(path.join(root, "404.html")));
  }
  res.writeHead(200, { ...base, "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(sitePort, "127.0.0.1", () => console.log(`site http://127.0.0.1:${sitePort}  lead stub http://127.0.0.1:${stubPort}`));
