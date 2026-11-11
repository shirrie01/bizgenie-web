#!/usr/bin/env bash
# BG-017C-07 R2 — READ-ONLY hosted acceptance of the tagged staging API revision (GET/HEAD only). v2 (BG-LAUNCH-ACCEPTANCE-04).
# Run in the founder's own terminal with existing gcloud login, from the bizgenie-web repository root. Tokens are read silently into shell variables, never printed,
# never written to files, never placed on a command line. Only statuses, short verdict text, the revision name and booleans are printed; no response body is printed.
# Verdicts: PASS | FAIL | BLOCKED | SKIPPED | NOT RUN (see scripts/staging/r2-verdicts.mjs). A full R2 PASS requires ALL mandatory cases to PASS:
#   target, owner_workspace (status=ready), owner_onboarding (contract workspace-onboarding.v1), foreign_calendar_denial (404 RESOURCE_NOT_AVAILABLE), unauthenticated_direct (API 401).
# A skipped/blocked/not-run mandatory case yields INCOMPLETE (exit 3), never PASS. Exit: 0 PASS, 1 FAIL, 2 refused to start, 3 INCOMPLETE.
set -uo pipefail
umask 077
[ "${BASH_VERSINFO[0]:-0}" -ge 4 ] || { echo "STOP: bash 4+ is required (use Cloud Shell or Linux)"; exit 2; }
PROJECT="bizgenie-backend"; REGION="europe-west1"; SERVICE="bizgenie-api-staging"; TAG="f1fc2f51"; REV="bizgenie-api-staging-00030-pob"; PORT="${PORT:-8787}"; ORIGIN="http://127.0.0.1:4173"
PROXY_PID=""; T=""; declare -A RES
cleanup(){ [ -n "$PROXY_PID" ] && { kill "$PROXY_PID" 2>/dev/null; wait "$PROXY_PID" 2>/dev/null; }; [ -n "$T" ] && rm -rf "$T"; unset OWNER_JWT OTHER_JWT REVOKED_JWT ID_TOKEN; }
trap cleanup EXIT; trap 'echo; echo "interrupted: cleaned up"; exit 130' INT TERM HUP
stop(){ echo "STOP: $*"; exit 2; }
for c in gcloud jq curl node date; do command -v "$c" >/dev/null || stop "$c not available"; done
[ -f scripts/staging/operator-proxy.mjs ] && [ -f scripts/staging/r2-verdicts.mjs ] || stop "run from the bizgenie-web repository root (latest main)"
T="$(mktemp -d)" || stop "cannot create a temporary directory"; chmod 700 "$T"

# 1. target: project, tag URL, revision, 0 % (read-only metadata). The untagged serving URL is never used.
[ "$(gcloud config get-value project 2>/dev/null)" = "$PROJECT" ] || stop "gcloud project is not $PROJECT (run: gcloud config set project $PROJECT)"
SVC="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format=json 2>/dev/null)" || stop "cannot read service $SERVICE"
UP="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | .url' | head -1)"
TREV="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | .revisionName' | head -1)"
TPCT="$(printf '%s' "$SVC" | jq -r --arg t "$TAG" '.status.traffic[]? | select(.tag==$t) | (.percent // 0)' | head -1)"
SERVING="$(printf '%s' "$SVC" | jq -r '[.status.traffic[]? | select((.percent // 0) > 0) | .revisionName + "=" + ((.percent // 0)|tostring) + "%"] | join(",")')"
case "$UP" in https://${TAG}---${SERVICE}-*.a.run.app) ;; *) stop "tag $TAG URL not found or malformed";; esac
[ "$TREV" = "$REV" ] || stop "tag $TAG points to '$TREV', expected $REV"
[ "$TPCT" = "0" ] || stop "tag $TAG carries ${TPCT}% traffic; the reviewed scenario expects 0%"
RES[target]=PASS
echo "PASS     target: tag=$TAG revision=$TREV traffic=${TPCT}% | serving now: $SERVING (not used by this run)"

# 2. identities (founder-owned staging users). Silent; nothing echoed. Only the owner is required to start; missing ones make cases BLOCKED/NOT RUN.
read -rsp "Owner access token (SM Properties staging owner): " OWNER_JWT >&2; echo >&2
[ -n "${OWNER_JWT:-}" ] || stop "owner token missing"
read -rsp "Second-tenant user token (blank = no second tenant; the mandatory cross-tenant case stays BLOCKED): " OTHER_JWT >&2; echo >&2
read -rsp "Already-revoked fixture token (blank = revoked cases NOT RUN; never revoke an account for this test): " REVOKED_JWT >&2; echo >&2
ID_TOKEN="$(gcloud auth print-identity-token 2>/dev/null)" || stop "cannot obtain your Google identity token"

# 3. hardened proxy: loopback only, tag-pinned, GET/HEAD only.
ACCEPTANCE=r2 PIN_TAG="$TAG" READ_ONLY=1 UPSTREAM="$UP" ID_TOKEN="$ID_TOKEN" STUDIO_ORIGIN="$ORIGIN" PORT="$PORT" node scripts/staging/operator-proxy.mjs >/dev/null 2>&1 &
PROXY_PID=$!; for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 0.5; curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; done
kill -0 "$PROXY_PID" 2>/dev/null || stop "the operator proxy did not start"

N=0
# call <case> <path> <token>  -> records the verdict in RES[case]; prints one line; leaves the body in $T/body.<case>
call(){
  local name="$1" path="$2" tok="$3" st label out v d
  # URL (it carries tenant/project identifiers) and headers go through a curl config on stdin, so neither the token nor the identifiers appear in the process list.
  st="$(printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nheader = "Origin: %s"\n' "http://127.0.0.1:$PORT$path" "$tok" "$ORIGIN" | curl -sS --max-redirs 0 -X GET -K - -D "$T/h.$name" -o "$T/body.$name" -w '%{http_code}' 2>/dev/null)" || st=000
  label="$(tr -d '\r' < "$T/h.$name" 2>/dev/null | awk -F': ' 'tolower($1)=="x-operator-proxy-response"{print $2}')"
  out="$(node scripts/staging/r2-verdicts.mjs case "$name" "$st" "$T/body.$name" "$label")"; v="${out%%$'\t'*}"; d="${out#*$'\t'}"
  RES[$name]="$v"; printf '%-8s %s: %s (revision %s)\n' "$v" "$name" "$d" "$TREV"
}
echo "-- owner (HOSTED READ)"
call owner_workspace /customer/workspace "$OWNER_JWT"
call owner_onboarding /customer/workspace/onboarding "$OWNER_JWT"
if [ -f "$T/body.owner_workspace" ] && [ -f "$T/body.owner_onboarding" ]; then out="$(node scripts/staging/r2-verdicts.mjs scope "$T/body.owner_workspace" "$T/body.owner_onboarding")"; printf '%-8s scope_match: %s\n' "${out%%$'\t'*}" "${out#*$'\t'}"; [ "${out%%$'\t'*}" = FAIL ] && RES[scope_match]=FAIL; fi

echo "-- second tenant"
FOREIGN=""
if [ -z "${OTHER_JWT:-}" ]; then
  RES[foreign_calendar_denial]=BLOCKED; echo "BLOCKED  foreign_calendar_denial: no second-tenant identity supplied (mandatory; full R2 cannot pass without it)"
else
  call other_workspace_ownstate /customer/workspace "$OTHER_JWT"
  call other_onboarding_ownstate /customer/workspace/onboarding "$OTHER_JWT"
  if [ "$(jq -r '.status // empty' "$T/body.other_workspace_ownstate" 2>/dev/null)" = ready ]; then
    FOREIGN="$(jq -r '[.. | objects | select((.tenant_id|type)=="string" and (.project_id|type)=="string") | [.tenant_id,.project_id]] | first // empty | @tsv' "$T/body.other_workspace_ownstate" 2>/dev/null)"
  fi
  OWN="$(jq -r '[.. | objects | select((.tenant_id|type)=="string" and (.project_id|type)=="string") | [.tenant_id,.project_id]] | first // empty | @tsv' "$T/body.owner_workspace" 2>/dev/null)"
  if [ -z "$FOREIGN" ]; then RES[foreign_calendar_denial]=BLOCKED; echo "BLOCKED  foreign_calendar_denial: the second identity has no ready workspace with a tenant/project pair to target"
  elif [ "$FOREIGN" = "$OWN" ]; then RES[foreign_calendar_denial]=BLOCKED; echo "BLOCKED  foreign_calendar_denial: both identities belong to the same tenant/project, so no foreign scope exists"
  else
    FT="${FOREIGN%%$'\t'*}"; FP="${FOREIGN##*$'\t'}"; FROM="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; TO="$(date -u -d '+30 days' +%Y-%m-%dT%H:%M:%SZ)"
    call foreign_calendar_denial "/customer/calendar?tenant_id=$FT&project_id=$FP&from=$FROM&to=$TO" "$OWNER_JWT"   # owner token, someone else's scope
    unset FT FP
  fi
  unset FOREIGN OWN
fi

echo "-- revoked membership (existing fixture only)"
if [ -z "${REVOKED_JWT:-}" ]; then echo "NOT RUN  revoked_onboarding, revoked_calendar: no existing revoked fixture supplied (no account is revoked by this script)"
else
  call revoked_onboarding /customer/workspace/onboarding "$REVOKED_JWT"
  OWN="$(jq -r '[.. | objects | select((.tenant_id|type)=="string" and (.project_id|type)=="string") | [.tenant_id,.project_id]] | first // empty | @tsv' "$T/body.owner_workspace" 2>/dev/null)"
  if [ -n "$OWN" ]; then call revoked_calendar "/customer/calendar?tenant_id=${OWN%%$'\t'*}&project_id=${OWN##*$'\t'}&from=$(date -u +%Y-%m-%dT%H:%M:%SZ)&to=$(date -u -d '+30 days' +%Y-%m-%dT%H:%M:%SZ)" "$REVOKED_JWT"; else echo "NOT RUN  revoked_calendar: no tenant/project pair known from the owner response"; fi
  unset OWN
fi

echo "-- unauthenticated, DIRECT to the tag URL (no customer bearer; not through the proxy)"
st="$(printf 'url = "%s"\nheader = "X-Serverless-Authorization: Bearer %s"\n' "$UP/customer/workspace/onboarding" "$ID_TOKEN" | curl -sS --proto '=https' --max-redirs 0 -X GET -K - -o "$T/body.unauth" -w '%{http_code}' 2>/dev/null)" || st=000
out="$(node scripts/staging/r2-verdicts.mjs case unauthenticated_direct "$st" "$T/body.unauth" "")"; RES[unauthenticated_direct]="${out%%$'\t'*}"; printf '%-8s unauthenticated_direct: %s (revision %s)\n' "${out%%$'\t'*}" "${out#*$'\t'}" "$TREV"

echo; ARGS=(); for k in "${!RES[@]}"; do ARGS+=("$k=${RES[$k]}"); done
final="$(node scripts/staging/r2-verdicts.mjs overall "${ARGS[@]}")"; rc=$?
echo "R2 RESULT: ${final%%$'\t'*} — ${final#*$'\t'}"; echo "(read-only; no writes made. PASS requires every mandatory case to PASS; skipped/blocked/not-run mandatory cases give INCOMPLETE.)"
exit "$rc"
