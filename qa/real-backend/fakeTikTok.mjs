// A STAND-IN for TikTok's HTTP API (BG-LAUNCH-006), used ONLY when RB_TIKTOK_STANDIN=1. It lets the real connector, vault, journal, media source and Studio be rehearsed in a browser
// with no live TikTok call. It is not TikTok: a run that uses it proves BizGenie's wiring and states, never TikTok acceptance. Every request is appended (sanitised: no token,
// no body) to a JSON-lines file so the browser test can assert what the connector sent. The real run simply does not set RB_TIKTOK_STANDIN.
import fs from "node:fs";
import { createHash } from "node:crypto";

export function createFakeTikTok({ logFile }) {
  const st = { n: 0, putSha256: null, putBytes: 0, revoked: 0 };
  const log = (entry) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url, opts = {}) => {
    const u = new URL(url); const method = opts.method || "GET";
    const base = { method, host: u.host, path: u.pathname, bearer: Boolean(opts.headers?.Authorization) };
    if (u.host === "open.tiktokapis.com") {
      if (u.pathname === "/v2/oauth/token/") { st.n += 1; log(base); return json({ open_id: "standin_open_id_1", scope: "user.info.basic,video.upload", access_token: `STANDIN_ACCESS_${st.n}`, refresh_token: `STANDIN_REFRESH_${st.n}`, expires_in: 86400, refresh_expires_in: 31536000, token_type: "Bearer" }); }
      if (u.pathname === "/v2/user/info/") { log(base); return json({ data: { user: { open_id: "standin_open_id_1", display_name: "Stand-in Creator", avatar_url: "https://standin.example/a.png" } }, error: { code: "ok" } }); }
      if (u.pathname === "/v2/post/publish/inbox/video/init/") { const b = JSON.parse(opts.body); log({ ...base, source: b.source_info?.source, video_size: b.source_info?.video_size, chunks: b.source_info?.total_chunk_count }); return json({ data: { publish_id: "standin_publish_1", upload_url: "https://upload.standin.example/put?x=1" }, error: { code: "ok" } }); }
      if (u.pathname === "/v2/post/publish/status/fetch/") { log(base); return json({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } }); }
      if (u.pathname === "/v2/oauth/revoke/") { st.revoked += 1; log(base); return json({ error: { code: "ok" } }); }
    }
    if (u.host === "upload.standin.example" && method === "PUT") { const buf = Buffer.from(opts.body); st.putSha256 = createHash("sha256").update(buf).digest("hex"); st.putBytes = buf.length; log({ ...base, bytes: buf.length, sha256: st.putSha256, range: opts.headers?.["Content-Range"] }); return new Response(null, { status: 201 }); }
    log({ ...base, unexpected: true }); throw new Error("stand-in: unexpected request to " + u.host + u.pathname);
  };
  return { fetch, state: st };
}

export const STANDIN_ENV = Object.freeze({
  TIKTOK_CLIENT_KEY: "standin_client_key", TIKTOK_CLIENT_SECRET: "standin_client_secret_not_real", TIKTOK_APP_REVIEW_APPROVED: "true", TIKTOK_OAUTH_REVIEW_REF: "standin-rehearsal",
  TIKTOK_UPLOAD_REVIEW_REF: "standin-rehearsal", TIKTOK_UPLOAD_ORIGINS: "https://upload.standin.example", TIKTOK_UPLOAD_CHUNK_BYTES: "33554432", SOCIAL_TOKEN_KEY_ID: "standin-key-1",
});
