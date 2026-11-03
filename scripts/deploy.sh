#!/usr/bin/env bash
# Frontend deploy on the Spasta server (Aureon docs/deploy-automation.md).
#
#   scripts/deploy.sh             # deploy origin/dev01 if it moved since the last good deploy
#   scripts/deploy.sh --force     # rebuild and redeploy the current origin/dev01
#   scripts/deploy.sh --rollback  # point the site back at the previous release
#
# fetch -> reset this checkout to origin/dev01 -> build a clean `git archive` of that commit in
# a node:22 container as this user (pnpm install --frozen-lockfile && pnpm build; the build runs
# `verify`: format, stylelint, type-check, tests) -> copy dist/ to
# /srv/www/spasta/releases/<sha> -> atomic symlink swap of /srv/www/spasta/current -> nginx
# reload (sudoers-restricted) -> smoke check through nginx; a failed check swaps back.
# Lock-protected (flock). The server-local .env.production is copied into the build.
set -euo pipefail
umask 022

WEB="${SPASTA_WEB_ROOT:-/srv/www/spasta}"
BUILDS="${SPASTA_BUILD_DIR:-$HOME/builds/astra}"
LOG_DIR="${DEPLOY_LOG_DIR:-/mnt/spasta-data/logs}"
BRANCH="${DEPLOY_BRANCH:-dev01}"
NODE_IMAGE="${DEPLOY_NODE_IMAGE:-node:22-alpine}"
PNPM_VERSION="${DEPLOY_PNPM_VERSION:-9}"
KEEP=5

main() {
  local repo mode="${1:-}"
  repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
  mkdir -p "$LOG_DIR" "$BUILDS" "$WEB/releases"
  exec 9>"$LOG_DIR/.deploy-frontend.lock"
  flock 9
  exec > >(while IFS= read -r l; do
    printf '%s frontend %s\n' "$(date -u +%FT%TZ)" "$l" >>"$LOG_DIR/deploy.log"
    printf '%s\n' "$l"
  done) 2>&1

  if [[ "$mode" == "--rollback" ]]; then
    rollback
    return
  fi

  cd "$repo"
  git fetch --quiet origin "$BRANCH"
  local want cur
  want="$(git rev-parse "origin/$BRANCH")"
  cur="$(cat "$LOG_DIR/.deployed-frontend" 2>/dev/null || true)"
  if [[ "$mode" != "--force" && "$want" == "$cur" && -e "$WEB/current" ]]; then
    echo "up to date at ${want:0:12}"
    return 0
  fi
  echo "deploy ${cur:0:12} -> ${want:0:12}"

  [[ "$(git rev-parse --abbrev-ref HEAD)" == "$BRANCH" ]] || git checkout --quiet "$BRANCH"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push --quiet -m "deploy.sh $(date -u +%FT%TZ): local edits before ${want:0:12}"
    echo "WARN: stashed local edits to tracked files (git stash list)"
  fi
  git reset --quiet --hard "$want"

  local short src rel
  short="${want:0:12}"
  src="$BUILDS/src-$short"
  rel="$WEB/releases/$short"
  rm -rf "$src"
  mkdir -p "$src" "$BUILDS/pnpm-store"
  git archive "$want" | tar -x -C "$src"
  [[ -f .env.production ]] && cp .env.production "$src/"

  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=true \
    -e npm_config_prefix=/tmp/npm -e npm_config_store_dir=/store \
    -v "$BUILDS/pnpm-store:/store" -v "$src:/w" -w /w "$NODE_IMAGE" sh -euc "
      npm install -g --silent pnpm@$PNPM_VERSION >/dev/null
      export PATH=/tmp/npm/bin:\$PATH
      pnpm install --frozen-lockfile --reporter=append-only
      pnpm build"
  [[ -f "$src/dist/index.html" ]] || { echo "FAILED: build produced no dist/index.html"; return 1; }

  rm -rf "$rel.tmp"
  cp -a "$src/dist" "$rel.tmp"
  rm -rf "$rel"
  mv "$rel.tmp" "$rel"

  local prev
  prev="$(readlink "$WEB/current" 2>/dev/null || true)"
  swap "releases/$short"
  if smoke "$rel"; then
    echo "$want" >"$LOG_DIR/.deployed-frontend"
    echo "OK $short live"
    prune
    rm -rf "$src"
    return 0
  fi
  echo "FAILED: smoke check for $short; swapping back to ${prev:-nothing}"
  [[ -n "$prev" ]] && swap "$prev"
  return 1
}

swap() { # $1 = target relative to $WEB; atomic rename of a fresh symlink over `current`
  ln -sfn "$1" "$WEB/.current.new"
  mv -T "$WEB/.current.new" "$WEB/current"
  # nginx serves the new files without a reload; the reload only drops open-file caches.
  sudo -n /usr/sbin/nginx -s reload 2>/dev/null || echo "WARN: nginx reload skipped (sudoers entry missing)"
  echo "current -> $1"
}

smoke() { # $1 = release dir; the live index.html must be this release's
  local body
  body="$(curl -fsS --max-time 5 -H 'Host: spasta.online' http://127.0.0.1:8088/)" || return 1
  [[ "$body" == "$(cat "$1/index.html")" ]]
}

prune() { # keep the newest $KEEP releases, never the live one
  local live
  live="$(basename "$(readlink "$WEB/current")")"
  find "$WEB/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn \
    | awk -v k="$KEEP" 'NR > k { print $2 }' | while read -r d; do
      [[ "$d" == "$live" ]] || rm -rf "${WEB:?}/releases/$d"
    done
}

rollback() {
  local live prev
  live="$(basename "$(readlink "$WEB/current")")"
  prev="$(find "$WEB/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn \
    | awk '{ print $2 }' | grep -vx "$live" | head -n 1)"
  [[ -n "$prev" ]] || { echo "no previous release to roll back to"; return 1; }
  swap "releases/$prev"
  echo "ROLLED BACK $live -> $prev (origin/$BRANCH is unchanged: revert the commit there too)"
}

# Whole file is parsed before main runs, so `git reset` replacing this file mid-deploy is safe.
main "$@"
exit $?
