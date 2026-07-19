import type { GithubMeta, Repo } from '@/types'

// Deterministic mock GitHub data, ported from the design. Real GitHub API calls
// would replace mockGithub()/mockRepos() once an OAuth token is available.

export function mockGithub(repo: string): GithubMeta {
  let h = 0
  for (let i = 0; i < repo.length; i++) h = (h * 31 + repo.charCodeAt(i)) | 0
  h = Math.abs(h)
  const messages = [
    'Fix flaky test',
    'Update dependencies',
    'Refactor auth flow',
    'Add dark mode',
    'Improve error handling',
    'Bump version',
  ]
  const prTitles = [
    'Add retry with backoff',
    'Refactor auth store',
    'Fix null deref on unmount',
    'Bump dependencies',
    'Improve type coverage',
    'Cache repo metadata',
  ]
  const authors = ['@octodev', '@lunar', '@nova', '@pulsar', '@vega']
  const nPr = (h % 3) + 1
  const prList = []
  for (let j = 0; j < nPr; j++) {
    const hj = Math.abs((h + 1) * (j + 3) * 31)
    const num = 200 + (hj % 600)
    prList.push({
      id: repo + '#' + num,
      num,
      title: prTitles[hj % prTitles.length],
      author: authors[hj % authors.length],
      url: 'https://github.com/' + repo + '/pull/' + num,
    })
  }
  return {
    branch: 'main',
    issues: h % 37,
    prs: h % 11,
    stars: (h % 9000) + 50,
    ci: h % 3 === 0 ? 'failing' : 'passing',
    commitMsg: messages[h % messages.length],
    commitTime: (h % 23) + 1 + 'h ago',
    prList,
  }
}

export function mockRepos(now: number): Repo[] {
  const langs: [string, string][] = [
    ['TypeScript', '#3178c6'],
    ['JavaScript', '#f1e05a'],
    ['Python', '#3572A5'],
    ['Go', '#00ADD8'],
    ['Rust', '#dea584'],
    ['CSS', '#563d7c'],
  ]
  const names = [
    'aureon-web',
    'stardust-ui',
    'orbit-api',
    'nebula-cli',
    'cosmos-docs',
    'lunar-scheduler',
    'pulsar-auth',
  ]
  const descs = [
    'Liquid-glass personal tracker',
    'Reusable glass component kit',
    'Async job & webhook runner',
    'Command-line companion',
    'Documentation site',
    'Recurring reminder engine',
    'Auth microservice',
  ]
  return names.map((nm, i) => {
    let h = 0
    for (let k = 0; k < nm.length; k++) h = (h * 31 + nm.charCodeAt(k)) | 0
    h = Math.abs(h)
    const lang = langs[h % langs.length]
    const issueTitles = [
      'Fix race condition on unmount',
      'Improve keyboard a11y',
      'Add retry with backoff',
      'Docs: fix typo',
      'Memory leak in worker',
      'Dark mode contrast',
      'Flaky CI on macos',
    ]
    return {
      id: 'r' + i,
      name: nm,
      full: 'you/' + nm,
      desc: descs[i],
      lang: lang[0],
      langColor: lang[1],
      stars: (h % 1400) + 3,
      issues: (h % 9) + 1,
      prs: h % 6,
      ci: (h % 4 === 0 ? 'failing' : 'passing') as 'failing' | 'passing',
      pushedMs: now - ((h % 70) + 1) * 3600000,
      pushedLabel: (h % 70) + 1 + 'h ago',
      openIssues: [0, 1, 2].slice(0, (h % 3) + 1).map((j) => ({
        id: 'i' + i + j,
        num: 100 + ((h + j * 7) % 600),
        title: issueTitles[(h + j) % issueTitles.length],
      })),
    }
  })
}
