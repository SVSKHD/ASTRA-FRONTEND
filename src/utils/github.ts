import type { GithubMeta } from '@/types'

// Deterministic mock GitHub data for the task dialog's inline repo panel, ported
// from the design. Repo and issue data proper now comes from the real
// integration (utils/ghProxy + utils/githubModel); this stays only as the
// placeholder behind a task's free-text `repo` field.

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
