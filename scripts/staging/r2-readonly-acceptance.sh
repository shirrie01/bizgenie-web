#!/usr/bin/env bash
# BG-017C-07 R2 — READ-ONLY hosted acceptance of the tagged staging API revision (GET/HEAD only).
# Run in the founder's own terminal with existing gcloud login. Tokens are read silently into shell variables, are never printed, never written to
# files or put on a command line. Only statuses, the revision name and JSON KEY NAMES are printed. Any wrong target or unexpected status stops the run.
# Requires: gcloud, jq, curl, node (repo checkout for scripts/staging/operator-proxy.mjs).
set -uo pipefail
PROJECT="bizgenie-backend"; REGION="europe-west1"; SERVICE="bizgenie-api-staging"; TAG="f1fc2f51"; REV="bizgenie-api-staging-00030-pob"; PORT="${PORT:-8787}"; ORIGIN="http://127.0.0.1:4173"
FAILS=0; PROXY_PID=""
stop(){ echo "STOP: $*"; cleanup; exit 1; }
cleanup(){ [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null; unset OWNER_JWT OTHER_JWT ID_TOKEN; }
trap cleanup EXIT
for c in gcloud jq curl node; do command -v "$c" >/dev/null || stop "$c not available"; done
[ -f scripts/staging/operator-proxy.mjs ] || stop "run from the bizgenie-web repository root"

# 1. Assert project and resolve the TAG URL (read-only metadata). The untagged 100 % serving URL is never used.
[ "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT" ] || stop "gcloud project is not $PROJECT (run: gcloud config set project $PROJECT)"
SVC="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json 2>/dev/null)" || stop "cannot read service $SERVICE"
UP="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | .url' | head -1)"
TREV="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | .revisionName' | head -1)"
TPCT="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | (.percent // 0)' | head -1)"
SERVING="$(printf '%s' "$SVC" | jq -r '[.status.traffic[]? | select((.percent // 0) > 0) | .revisionName + "=" + ((.percent // 0)|tostring) + "%"] | join(",")')"
case "$UP" in https://${TAG}---${SERVICE}-*.a.run.app) ;; *) stop "tag $TAG URL not found or malformed";; esac
[ "$TREV" = "$REV" ] || stop "tag $TAG points to '$TREV', expected $REV"
[ "$TPCT" = "0" ] || stop "tag $TAG carries ${TPCT}% traffic; the reviewed scenario expects 0%"
echo "target ok: tag=$TAG revision=$TREV traffic=${TPCT}%  | serving now: $SERVING (not used by this run)"

# 2. Test identities (founder-owned staging users). Silent read; nothing echoed.
read -rsp "Owner access token (SM Properties staging owner): " OWNER_JWT; echo
[ -n "${OWNER_JWT:-}" ] || stop "owner token missing"
read -rsp "Second-tenant user token (blank = skip those checks): " OTHER_JWT; echo
ID_TOKEN="$(gcloud auth print-identity-token 2>/dev/null)" || stop "cannot obtain your Google identity token"

# 3. Hardened proxy: loopback only, tag-pinned, GET/HEAD only.
ACCEPTANCE=r2 PIN_TAG="$TAG" READ_ONLY=1 UPSTREAM="$UP" ID_TOKEN="$ID_TOKEN" STUDIO_ORIGIN="$ORIGIN" PORT="$PORT" node scripts/staging/operator-proxy.mjs >/dev/null 2>&1 &
PROXY_PID=$!; for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 0.5; curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; done

HDR="$(mktemp)"; BODY="$(mktemp)"; chmod 600 "$HDR" "$BODY"; trap 'rm -f "$HDR" "$BODY"; cleanup' EXIT
# probe <label> <path> <token> <comma-separated acceptable statuses>
probe(){
  local label="$1" path="$2" tok="$3" ok="$4" st who shape
  st="$(printf 'Authorization: Bearer %s\nOrigin: %s\n' "$tok" "$ORIGIN" | curl -s -X GET -D "$HDR" -o "$BODY" -w '%{http_code}' -H @- "http://127.0.0.1:$PORT$path")"
  who="$(tr -d '\r' < "$HDR" | awk -F': ' 'tolower($1)=="x-operator-proxy-response"{print $2}')"
  shape="$(jq -c 'if type=="object" then keys else type end' "$BODY" 2>/dev/null || echo unreadable)"
  if [ "$who" != "upstream" ]; then echo "FAIL  $label: status $st was produced by '${who:-unknown}', not the API"; FAILS=$((FAILS+1)); return 1; fi
  case ",$ok," in *",$st,"*) echo "PASS  $label: HTTP $st (revision $TREV) keys=$shape";; *) echo "FAIL  $label: HTTP $st, expected $ok"; FAILS=$((FAILS+1)); return 1;; esac
}
echo "-- owner reads (HOSTED READ)"
probe "owner GET /customer/workspace" /customer/workspace "$OWNER_JWT" 200,404
cp "$BODY" "$BODY.owner" 2>/dev/null && chmod 600 "$BODY.owner"
probe "owner GET /customer/workspace/onboarding" /customer/workspace/onboarding "$OWNER_JWT" 200,404
echo "   (a 503 here means preflight or SQL failed on the real pool: stop and report)"
echo "-- second tenant"
if [ -z "${OTHER_JWT:-}" ]; then
  echo "SKIPPED second-tenant own-state and explicit-denial checks: no second-tenant identity supplied"
else
  probe "other-tenant GET /customer/workspace (own state, NOT a denial test)" /customer/workspace "$OTHER_JWT" 200,404
  probe "other-tenant GET /customer/workspace/onboarding (own state, NOT a denial test)" /customer/workspace/onboarding "$OTHER_JWT" 200,404
  IDS="$(jq -r '[.. | objects | select(has("tenant_id") and has("project_id")) | [.tenant_id,.project_id]] | first // empty | @tsv' "$BODY.owner" 2>/dev/null)"
  if [ -z "$IDS" ]; then echo "SKIPPED explicit cross-tenant denial: owner response has no tenant_id/project_id pair to target"
  else T="${IDS%%$'\t'*}"; P="${IDS##*$'\t'}"
    probe "EXPLICIT cross-tenant denial: other token reads owner's campaigns" "/customer/campaigns?tenant_id=$T&project_id=$P" "$OTHER_JWT" 401,403,404
    unset T P IDS; fi
fi
rm -f "$BODY.owner"
echo "-- unauthenticated, DIRECT to the tag URL (not through the proxy)"
st="$(printf 'X-Serverless-Authorization: Bearer %s\n' "$ID_TOKEN" | curl -s -X GET -o /dev/null -w '%{http_code}' -H @- "$UP/customer/workspace/onboarding")"
if [ "$st" = "401" ]; then echo "PASS  unauthenticated direct GET: HTTP 401 from the API (revision $TREV)"; else echo "FAIL  unauthenticated direct GET: HTTP $st, expected 401"; FAILS=$((FAILS+1)); fi
echo; [ "$FAILS" -eq 0 ] && echo "R2 RESULT: all executed checks passed (read-only; no writes made). Skipped items are listed above." || echo "R2 RESULT: $FAILS check(s) FAILED"
exit "$FAILS"
