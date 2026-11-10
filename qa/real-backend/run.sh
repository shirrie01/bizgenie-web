#!/usr/bin/env bash
# Real-backend browser acceptance (BG-STUDIO-028-FE). Local only: needs a bizgenie-api checkout (#220 e653ed3 or later, with node_modules) and a throwaway PostgreSQL superuser.
#   BIZGENIE_API_DIR=/path/to/bizgenie-api TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres qa/real-backend/run.sh [1440x900] [playwright args]
# Starts a fresh harness (own database, dropped on exit), builds the app with every gate ON against it, serves it on 4182, runs the spec, and stops everything.
set -u
: "${BIZGENIE_API_DIR:?}" "${TEST_DATABASE_URL:?}"
cd "$(dirname "$0")/../.."
VP=${1:-1440x900}; [ $# -gt 0 ] && shift
IDS=$(mktemp); LOG=$(mktemp)
RB_IDS=$IDS RB_PORT=4300 RB_ORIGIN=http://127.0.0.1:4182 node qa/real-backend/server.mjs >"$LOG" 2>&1 & BACK=$!
trap 'kill $BACK $PREV 2>/dev/null; wait $BACK 2>/dev/null' EXIT
for _ in $(seq 1 60); do grep -q READY "$LOG" && break; sleep 0.5; done; grep -q READY "$LOG" || { echo "harness did not start"; cat "$LOG"; exit 3; }
VITE_PREMIUM_STUDIO_ENABLED=true VITE_PLAN_CATALOGUE_API=true VITE_BILLING_MANAGEMENT_API=true VITE_CREDIT_PREVIEW_API=true VITE_GENERATION_QUOTE_API=true VITE_WORKSPACE_CALENDAR_API=true VITE_SOCIAL_ACCOUNTS_API=true VITE_ANALYTICS_API=true VITE_CUSTOMER_MEDIA_API=true VITE_CUSTOMER_MEDIA_INTAKE_API=true VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=placeholder-public-key VITE_BIZGENIE_API_URL=http://127.0.0.1:4300 npx vite build --outDir dist-rb >/dev/null || exit 4
npx vite preview --outDir dist-rb --port 4182 --strictPort --host 127.0.0.1 >/dev/null 2>&1 & PREV=$!
sleep 3
RB_IDS=$IDS BG_VIEWPORT=$VP npx playwright test --config qa/real-backend/playwright.config.mjs "$@"
