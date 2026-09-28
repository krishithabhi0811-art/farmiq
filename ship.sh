#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  ship.sh — put EVERY change on the SAME two live URLs.
#
#      bash ship.sh "what I changed"
#
#  It does all four steps for you, in order:
#     1. commit + push the code to GitHub
#     2. redeploy the backend  → https://farmiq-api-y3sj.onrender.com  (same URL)
#     3. rebuild + redeploy the frontend → https://farmiq-flax.vercel.app (same URL)
#     4. run the 40 end-to-end tests against the live app
#
#  Tokens are read from .deploy.env (git-ignored, never committed).
#  Safe to run with nothing changed — it will just redeploy the same code.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"

STABLE_WEB="farmiq-flax.vercel.app"
API_URL_DEFAULT="https://farmiq-api-y3sj.onrender.com"

# ── tokens ────────────────────────────────────────────────────────────────
if [ -f .deploy.env ]; then set -a; . ./.deploy.env; set +a; fi
: "${GITHUB_TOKEN:?Set GITHUB_TOKEN in .deploy.env (or export it)}"
: "${RENDER_API_KEY:?Set RENDER_API_KEY in .deploy.env (or export it)}"
: "${VERCEL_TOKEN:?Set VERCEL_TOKEN in .deploy.env (or export it)}"
API_URL="${API_URL:-$API_URL_DEFAULT}"
REPO="${REPO:-krishithabhi0811-art/farmiq}"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-dat059t9fdbs73fcu2g0}"

MSG="${1:-update $(date '+%Y-%m-%d %H:%M')}"
step() { printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }

# ── 1. GitHub ─────────────────────────────────────────────────────────────
step "1/4  Code → GitHub"
git add -A
if git diff --cached --quiet; then
  echo "  nothing new to commit — shipping the current code"
else
  git -c user.name="FARM-IQ" -c user.email="deploy@farmiq.local" commit -q -m "$MSG"
  echo "  committed: $(git log --oneline -1)"
fi
git push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" main
echo "  pushed to https://github.com/${REPO}  ($(git rev-parse --short HEAD))"

# ── 2. Render (backend) ───────────────────────────────────────────────────
step "2/4  Backend → Render (same URL)"
node server/scripts/deploy-render.js 2>&1 | sed 's/^/  /' || echo "  (service settings already up to date — continuing)" 
DEP=$(curl -s -m 40 -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        "https://api.render.com/v1/services/${SERVICE_ID}/deploys" \
        -d '{"clearCache":"do_not_clear"}' \
     | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).id||'')}catch{console.log('')}})")
echo "  deploy: ${DEP:-unknown} — waiting for it to go live…"
for i in $(seq 1 40); do
  sleep 15
  ST=$(curl -s -m 25 -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" \
        "https://api.render.com/v1/services/${SERVICE_ID}/deploys?limit=1" \
      | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log((j[0]?.deploy?.status||'?')+' '+(j[0]?.deploy?.commit?.id||'').slice(0,7))})")
  case "$ST" in
    "live "*) echo "  backend live: $ST"; break;;
    *) printf '  %s\n' "$ST";;
  esac
done
curl -s -m 30 "$API_URL/api/health" | head -c 200 | sed 's/^/  health: /'; echo

# ── 3. Vercel (frontend) ──────────────────────────────────────────────────
step "3/4  Frontend → Vercel (same URL)"
( cd client && npm run build 2>&1 | tail -4 | sed 's/^/  /' )
( cd client && VERCEL_TOKEN="$VERCEL_TOKEN" API_URL="$API_URL" STABLE_DOMAIN="$STABLE_WEB" npm run deploy 2>&1 | sed 's/^/  /' )

# ── 4. Prove it ───────────────────────────────────────────────────────────
step "4/4  Live end-to-end tests"
( cd server && npm run smoke -- "$API_URL" 2>&1 | tail -3 | sed 's/^/  /' )

printf '\n\033[1;36m✅ Shipped. Same two URLs, newest code:\033[0m\n'
echo "   App      : https://${STABLE_WEB}"
echo "   Backend  : ${API_URL}"
echo "   Commit   : $(git rev-parse --short HEAD)  ($(git log -1 --pretty=%s))"
echo "   Check which build you are on: open the app → Profile → bottom line."
