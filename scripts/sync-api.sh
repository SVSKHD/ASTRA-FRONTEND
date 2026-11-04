#!/usr/bin/env bash
# Keep the typed API client current with the backend.
#
#   scripts/sync-api.sh                      # export from the backend repo (main), regenerate, check
#   scripts/sync-api.sh --ref feat/x         # ... from another backend branch
#   scripts/sync-api.sh --from-url https://spasta.online
#                                            # read /api/openapi.json from a running server
#   scripts/sync-api.sh --no-check           # regenerate only (no type-check / tests)
#
# Sources:
#   repo (default)  Clones the backend (BACKEND_REPO, public) at --ref, installs it in a
#                   throwaway venv and runs its scripts/export_openapi.py — the same export
#                   the backend's own docs describe. Builds the app with placeholder settings:
#                   nothing is connected and no secret is read.
#   --from-url      Signs in as a service account (AUREON_SERVICE_EMAIL /
#                   AUREON_SERVICE_PASSWORD, env only — never arguments) and reads
#                   <url>/api/openapi.json with that session. Production serves it only when
#                   API_DOCS_ENABLED=true; otherwise this fails with a clear message.
#
# Then: src/api/openapi.json is replaced, prettier-formatted, src/api/schema.d.ts regenerated
# (pnpm api:gen), and type-check + tests run. Exit code 0 = synced and green. Prints
# "api: changed" or "api: unchanged" last, for the scheduled workflow.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="${BACKEND_REPO:-https://github.com/SVSKHD/Aureon_agents_Assembler.git}"
REF="${BACKEND_REF:-main}"
URL=""
CHECK=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --from-url) URL="${2%/}"; shift 2 ;;
    --no-check) CHECK=0; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/openapi.json"

if [[ -n "$URL" ]]; then
  : "${AUREON_SERVICE_EMAIL:?set AUREON_SERVICE_EMAIL for --from-url}"
  : "${AUREON_SERVICE_PASSWORD:?set AUREON_SERVICE_PASSWORD for --from-url}"
  JAR="$TMP/cookies"
  # The body goes through a file so the password is never on a command line.
  python3 - "$TMP/login.json" <<'PY'
import json, os, sys
json.dump({"email": os.environ["AUREON_SERVICE_EMAIL"], "password": os.environ["AUREON_SERVICE_PASSWORD"]}, open(sys.argv[1], "w"))
PY
  code="$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" -H 'Content-Type: application/json' \
    --data-binary @"$TMP/login.json" "$URL/api/auth/login")"
  rm -f "$TMP/login.json"
  [[ "$code" == "200" ]] || { echo "service login failed: HTTP $code" >&2; exit 1; }
  code="$(curl -sS -o "$OUT" -w '%{http_code}' -b "$JAR" "$URL/api/openapi.json")"
  if [[ "$code" == "404" ]]; then
    echo "$URL does not serve /api/openapi.json (API_DOCS_ENABLED is off). Use the repo source." >&2
    exit 1
  fi
  [[ "$code" == "200" ]] || { echo "openapi.json: HTTP $code" >&2; exit 1; }
else
  echo "exporting the OpenAPI schema from $REPO@$REF"
  git clone -q --depth 1 --branch "$REF" "$REPO" "$TMP/backend"
  python3 -m venv "$TMP/venv"
  PY="$TMP/venv/bin/python"
  [[ -x "$PY" ]] || PY="$TMP/venv/Scripts/python.exe" # Windows (Git Bash)
  "$PY" -m pip install -q --disable-pip-version-check -e "$TMP/backend"
  "$PY" "$TMP/backend/scripts/export_openapi.py" --out "$OUT"
fi

python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d.get("openapi") and d.get("paths"), "not an OpenAPI document"' "$OUT"
cp "$OUT" src/api/openapi.json
npx prettier --write src/api/openapi.json >/dev/null
pnpm -s api:gen
npx prettier --write src/api/schema.d.ts >/dev/null 2>&1 || true

if [[ "$CHECK" == "1" ]]; then
  pnpm -s type-check
  pnpm -s test
fi

if git diff --quiet -- src/api/openapi.json src/api/schema.d.ts; then
  echo "api: unchanged"
else
  git --no-pager diff --stat -- src/api/openapi.json src/api/schema.d.ts
  echo "api: changed"
fi
