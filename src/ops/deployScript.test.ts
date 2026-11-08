// @vitest-environment node
// scripts/deploy.sh (the server's frontend deploy) with fake docker / curl / sudo on PATH and a
// throwaway git origin: the stage lines Aureon shows on the Deploys dashboard
// (docs/33-deploy-progress.md in Aureon), the exit codes deploy-poll records, and that the live
// release is only replaced by a release that passed its smoke check and verification.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')

// `docker run ... -v <src>:/w ... sh -euc "<script>"`: install / build in the source dir.
const DOCKER = `#!/usr/bin/env bash
src=""
prev=""
for a in "$@"; do
  if [[ "$prev" == "-v" && "$a" == *":/w" ]]; then src="\${a%:/w}"; fi
  prev="$a"
done
cmd="\${*: -1}"
if [[ "$cmd" == *"pnpm install"* ]]; then exit "\${FAIL_INSTALL:-0}"; fi
if [[ "$cmd" == *"pnpm build"* ]]; then
  [[ -n "\${FAIL_BUILD:-}" ]] && exit 1
  mkdir -p "$src/dist" && echo "<html>$(git -C "$src" rev-parse HEAD 2>/dev/null || cat "$src/VERSION")</html>" >"$src/dist/index.html"
fi
exit 0
`
// The smoke check: what nginx serves is the live release's index.html (or a broken page).
const CURL = `#!/usr/bin/env bash
live="$(readlink "$SPASTA_WEB_ROOT/current")"
if [[ -n "\${BROKEN_RELEASE:-}" && "$live" == "releases/$BROKEN_RELEASE"* ]]; then echo broken; exit 0; fi
cat "$SPASTA_WEB_ROOT/$live/index.html"
`
const SUDO = `#!/usr/bin/env bash
exit 0
`

let tmp = ''
let env: NodeJS.ProcessEnv = {}
let repo = ''

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
    encoding: 'utf8',
  }).trim()
}

function commit(seed: string, version: string, subject: string): string {
  writeFileSync(join(seed, 'VERSION'), `${version}\n`)
  git(seed, 'add', '.')
  git(seed, 'commit', '-q', '-m', subject)
  git(seed, 'push', '-q', 'origin', 'dev01')
  return git(seed, 'rev-parse', 'HEAD')
}

function deploy(extra: Record<string, string> = {}) {
  return spawnSync('bash', [join(repo, 'scripts', 'deploy.sh')], {
    env: { ...env, ...extra },
    encoding: 'utf8',
    timeout: 60_000,
  })
}

function stages(): [string, string, string][] {
  const file = join(env.DEPLOY_LOG_DIR!, '.deploy-frontend.phases')
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('stage='))
    .map((l) => {
      const [name, status, , detail] = l.slice(6).split('|')
      return [name, status, detail]
    })
}

function phases(): Record<string, string> {
  const file = join(env.DEPLOY_LOG_DIR!, '.deploy-frontend.phases')
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('stage='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}

const web = () => env.SPASTA_WEB_ROOT!
const live = () => readlinkSync(join(web(), 'current'))

describe('scripts/deploy.sh (frontend)', () => {
  let first = ''
  let seed = ''

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fe-deploy-'))
    const bin = join(tmp, 'bin')
    mkdirSync(bin)
    for (const [name, body] of [
      ['docker', DOCKER],
      ['curl', CURL],
      ['sudo', SUDO],
    ] as const) {
      writeFileSync(join(bin, name), body)
      chmodSync(join(bin, name), 0o755)
    }
    const origin = join(tmp, 'origin.git')
    git(tmp, 'init', '-q', '--bare', '-b', 'dev01', origin)
    seed = join(tmp, 'seed')
    git(tmp, 'clone', '-q', origin, seed)
    git(seed, 'checkout', '-q', '-b', 'dev01')
    mkdirSync(join(seed, 'scripts'))
    writeFileSync(
      join(seed, 'scripts', 'deploy.sh'),
      readFileSync(join(ROOT, 'scripts', 'deploy.sh')),
    )
    chmodSync(join(seed, 'scripts', 'deploy.sh'), 0o755)
    first = commit(seed, 'one', 'first release')
    repo = join(tmp, 'server')
    git(tmp, 'clone', '-q', '-b', 'dev01', origin, repo)
    env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: tmp,
      SPASTA_WEB_ROOT: join(tmp, 'www'),
      SPASTA_BUILD_DIR: join(tmp, 'builds'),
      DEPLOY_LOG_DIR: join(tmp, 'logs'),
    }
  })

  afterEach(() => {
    spawnSync('rm', ['-rf', tmp])
  })

  it('reports every stage in order and records health only after verification', () => {
    const r = deploy()
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(stages().map(([n, s]) => `${n}:${s}`)).toEqual([
      'pulling:running',
      'pulling:succeeded',
      'validating:running',
      'validating:succeeded',
      'building:running',
      'building:succeeded',
      'restarting:running',
      'restarting:succeeded',
      'health_checking:running',
      'health_checking:succeeded',
      'verifying:running',
      'verifying:succeeded',
    ])
    const p = phases()
    expect(p.sha).toBe(first)
    expect(Object.keys(p)).toContain('health_ok')
    expect(live()).toBe(`releases/${first.slice(0, 12)}`)
    expect(readFileSync(join(web(), live(), '.release-commit'), 'utf8').trim()).toBe(first)
    expect(readFileSync(join(env.DEPLOY_LOG_DIR!, '.deployed-frontend'), 'utf8').trim()).toBe(first)
  })

  it('names the PR of a GitHub merge commit', () => {
    deploy()
    commit(seed, 'two', 'Merge pull request #103 from SVSKHD/claude/x')
    expect(deploy().status).toBe(0)
    expect(phases().pr).toBe('103')
  })

  it('a failed build exits 3 and never touches the live site', () => {
    expect(deploy().status).toBe(0)
    const before = live()
    commit(seed, 'two', 'broken change')
    const r = deploy({ FAIL_BUILD: '1' })
    expect(r.status).toBe(3)
    const s = stages()
    expect(s.find(([n]) => n === 'building')?.[1]).toBe('running')
    expect(s.at(-1)?.slice(0, 2)).toEqual(['building', 'failed'])
    expect(s.some(([n]) => n === 'restarting' || n === 'rolling_back')).toBe(false)
    expect(Object.keys(phases())).not.toContain('health_ok')
    expect(live()).toBe(before)
  })

  it('a frozen-lockfile failure is a validation failure', () => {
    commit(seed, 'two', 'lockfile drift')
    const r = deploy({ FAIL_INSTALL: '1' })
    expect(r.status).toBe(3)
    expect(stages().at(-1)?.slice(0, 2)).toEqual(['validating', 'failed'])
  })

  it('a failed smoke check rolls back to the previous release (exit 1)', () => {
    expect(deploy().status).toBe(0)
    const before = live()
    const second = commit(seed, 'two', 'bad release')
    const r = deploy({ BROKEN_RELEASE: second.slice(0, 12) })
    expect(r.status, r.stdout).toBe(1)
    const s = stages().map(([n, st]) => `${n}:${st}`)
    expect(s).toContain('health_checking:failed')
    expect(s.slice(-2)).toEqual(['rolling_back:running', 'rolling_back:succeeded'])
    expect(s).not.toContain('verifying:succeeded')
    expect(Object.keys(phases())).not.toContain('health_ok')
    expect(live()).toBe(before)
    expect(existsSync(join(env.DEPLOY_LOG_DIR!, '.deployed-frontend'))).toBe(true)
    expect(readFileSync(join(env.DEPLOY_LOG_DIR!, '.deployed-frontend'), 'utf8').trim()).toBe(first)
  })

  it('with nothing to roll back to, a failed smoke check exits 2', () => {
    const r = deploy({ BROKEN_RELEASE: first.slice(0, 12) })
    expect(r.status).toBe(2)
    expect(stages().at(-1)?.slice(0, 2)).toEqual(['rolling_back', 'failed'])
  })

  it('an up-to-date checkout reports pulling only', () => {
    expect(deploy().status).toBe(0)
    expect(deploy().status).toBe(0)
    expect(stages().map(([n, s]) => `${n}:${s}`)).toEqual(['pulling:running', 'pulling:succeeded'])
  })
})
