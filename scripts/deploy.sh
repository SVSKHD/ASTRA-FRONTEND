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
#
# Live progress (Aureon docs/33-deploy-progress.md): one `stage=name|status|time|detail` line per
# real transition in $DEPLOY_LOG_DIR/.deploy-frontend.phases, which Aureon's deploy poller
# reports to the Spasta Deploys dashboard: pulling, validating (pnpm install --frozen-lockfile),
# building (pnpm build: verify + vite), restarting (publish + switch the release),
# health_checking (the smoke check through nginx), verifying (the live release is the commit),
# and rolling_back when the previous release had to be put back.
# Exit: 0 deployed | 1 failed, rolled back to a healthy release | 2 failed and the rollback is
# not healthy (or there was nothing to roll back to) | 3 failed before the switch (the live site
# was never touched).
set -euo pipefail
umask 022

WEB="${SPASTA_WEB_ROOT:-/srv/www/spasta}"
BUILDS="${SPASTA_BUILD_DIR:-$HOME/builds/astra}"
LOG_DIR="${DEPLOY_LOG_DIR:-/mnt/spasta-data/logs}"
BRANCH="${DEPLOY_BRANCH:-dev01}"
NODE_IMAGE="${DEPLOY_NODE_IMAGE:-node:22-alpine}"
PNPM_VERSION="${DEPLOY_PNPM_VERSION:-9}"
KEEP=5
PHASES=""
check_error=""

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

  PHASES="$LOG_DIR/.deploy-frontend.phases"
  : >"$PHASES"
  cd "$repo"
  stage pulling running
  if ! git fetch --quiet origin "$BRANCH"; then
    stage pulling failed "git fetch origin/$BRANCH failed"
    phase failure "git fetch failed"
    return 3
  fi
  local want cur
  want="$(git rev-parse "origin/$BRANCH")"
  cur="$(cat "$LOG_DIR/.deployed-frontend" 2>/dev/null || true)"
  if [[ "$mode" != "--force" && "$want" == "$cur" && -e "$WEB/current" ]]; then
    stage pulling succeeded "already at ${want:0:12}"
    echo "up to date at ${want:0:12}"
    return 0
  fi
  echo "deploy ${cur:0:12} -> ${want:0:12}"
  phase sha "$want"
  local pr
  pr="$(git log -1 --format=%s "$want" | sed -nE 's/^Merge pull request #([0-9]+) .*/\1/p')"
  [[ -n "$pr" ]] && phase pr "$pr"

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
  stage pulling succeeded "$short"

  # Nothing is live yet: a failure in these stages leaves the site as it is (exit 3).
  stage validating running "pnpm install --frozen-lockfile"
  if ! in_node "$src" "pnpm install --frozen-lockfile --reporter=append-only"; then
    stage validating failed "pnpm install --frozen-lockfile failed (lockfile out of date?)"
    phase failure "dependency install failed"
    return 3
  fi
  stage validating succeeded
  stage building running "pnpm build (verify + vite)"
  phase build_started
  if ! in_node "$src" "pnpm build"; then
    stage building failed "pnpm build failed (format, stylelint, type-check, tests or vite)"
    phase failure "build failed"
    return 3
  fi
  if [[ ! -f "$src/dist/index.html" ]]; then
    stage building failed "the build produced no dist/index.html"
    phase failure "build produced no dist/index.html"
    echo "FAILED: build produced no dist/index.html"
    return 3
  fi
  phase build_finished
  stage building succeeded

  stage restarting running "publish releases/$short and switch to it"
  phase deploy_started
  rm -rf "$rel.tmp"
  cp -a "$src/dist" "$rel.tmp"
  printf '%s\n' "$want" >"$rel.tmp/.release-commit"
  rm -rf "$rel"
  mv "$rel.tmp" "$rel"
  local prev
  prev="$(readlink "$WEB/current" 2>/dev/null || true)"
  swap "releases/$short"
  phase deploy_finished
  stage restarting succeeded

  local fail=""
  stage health_checking running "smoke check through nginx"
  if ! smoke "$rel"; then
    fail="smoke check: nginx does not serve this release's index.html"
    stage health_checking failed "$fail"
  else
    stage health_checking succeeded
    stage verifying running
    if ! verify_release "$want" "$short"; then
      fail="$check_error"
      stage verifying failed "$fail"
    else
      stage verifying succeeded "live release is ${short}"
    fi
  fi
  if [[ -z "$fail" ]]; then
    phase health_ok
    echo "$want" >"$LOG_DIR/.deployed-frontend"
    echo "OK $short live"
    prune
    rm -rf "$src"
    return 0
  fi

  phase failure "$fail"
  echo "FAILED: $fail; swapping back to ${prev:-nothing}"
  phase rollback_started
  stage rolling_back running "to ${prev:-nothing}"
  if [[ -z "$prev" ]]; then
    stage rolling_back failed "there is no previous release to go back to"
    phase rollback_finished
    return 2
  fi
  swap "$prev"
  phase rollback_finished
  if smoke "$WEB/$prev"; then
    stage rolling_back succeeded "$(basename "$prev") is live again"
    return 1
  fi
  stage rolling_back failed "the previous release does not pass the smoke check either"
  return 2
}

# $1 = source dir, $2 = the command: run in the pinned node image as this user.
in_node() {
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=true \
    -e npm_config_prefix=/tmp/npm -e npm_config_store_dir=/store \
    -v "$BUILDS/pnpm-store:/store" -v "$1:/w" -w /w "$NODE_IMAGE" sh -euc "
      npm install -g --silent pnpm@$PNPM_VERSION >/dev/null
      export PATH=/tmp/npm/bin:\$PATH
      $2"
}

# The release that answers is the commit: `current` points at releases/<short>, and that
# release was built from the commit (.release-commit written when it was published).
verify_release() { # $1 = want, $2 = short; sets $check_error
  local live
  live="$(readlink "$WEB/current" 2>/dev/null || true)"
  if [[ "$live" != "releases/$2" ]]; then
    check_error="current points at ${live:-nothing}, expected releases/$2"
    return 1
  fi
  if [[ "$(cat "$WEB/$live/.release-commit" 2>/dev/null)" != "$1" ]]; then
    check_error="the live release was not built from ${1:0:12}"
    return 1
  fi
}

# stage NAME STATUS [DETAIL] / phase NAME [VALUE]: progress lines for Aureon (docs/33).
stage() {
  local detail
  detail="$(printf '%s' "${3:-}" | tr -d '\n\r|' | cut -c1-300)"
  printf 'stage=%s|%s|%s|%s\n' "$1" "$2" "$(date -u +%FT%TZ)" "$detail" >>"$PHASES"
}

phase() {
  printf '%s=%s\n' "$1" "$(printf '%s' "${2:-$(date -u +%FT%TZ)}" | tr -d '\n\r' | cut -c1-300)" \
    >>"$PHASES"
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

# Release directory names, newest first. `ls -t` rather than `find -printf`:
# BusyBox find (Alpine, the node:22-alpine build image) has no -printf.
# Release names are commit hashes, so word splitting is safe.
releases_newest_first() {
  local d
  for d in $(ls -1t "$WEB/releases" 2>/dev/null); do
    [[ -d "$WEB/releases/$d" ]] && printf '%s\n' "$d"
  done
  return 0
}

prune() { # keep the newest $KEEP releases, never the live one
  local live
  live="$(basename "$(readlink "$WEB/current")")"
  releases_newest_first | awk -v k="$KEEP" 'NR > k { print }' | while read -r d; do
    [[ "$d" == "$live" ]] || rm -rf "${WEB:?}/releases/$d"
  done
}

rollback() {
  local live prev
  live="$(basename "$(readlink "$WEB/current")")"
  prev="$(releases_newest_first | grep -vx "$live" | head -n 1)"
  [[ -n "$prev" ]] || { echo "no previous release to roll back to"; return 1; }
  swap "releases/$prev"
  echo "ROLLED BACK $live -> $prev (origin/$BRANCH is unchanged: revert the commit there too)"
}

# Whole file is parsed before main runs, so `git reset` replacing this file mid-deploy is safe.
main "$@"
exit $?
