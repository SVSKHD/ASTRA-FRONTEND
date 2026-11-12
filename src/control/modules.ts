// The control center's modules, in nav order. `repo` marks the ones that work
// on the selected repository and so show the repo picker in the header.

export const MODULES = [
  { value: 'github', label: 'GitHub', short: 'GitHub', repo: true },
  { value: 'repo', label: 'Repository', short: 'Repo', repo: true },
  { value: 'issues', label: 'Issues', short: 'Issues', repo: true },
  { value: 'pulls', label: 'Pull requests', short: 'PRs', repo: true },
  { value: 'reviews', label: 'Reviews', short: 'Reviews', repo: true },
  { value: 'actions', label: 'Actions', short: 'Actions', repo: true },
  { value: 'agents', label: 'Agents', short: 'Agents', repo: false },
  { value: 'system', label: 'System', short: 'System', repo: false },
  { value: 'dhan', label: 'Dhan ops', short: 'Dhan', repo: false },
  { value: 'models', label: 'AI chats', short: 'Chats', repo: false },
  { value: 'images', label: 'Images', short: 'Images', repo: false },
  { value: 'git', label: 'Local git', short: 'Git', repo: false },
  { value: 'repairs', label: 'Repairs', short: 'Repairs', repo: false },
  { value: 'inbox', label: 'Approvals', short: 'Inbox', repo: false },
  { value: 'ai-approvals', label: 'AI approvals', short: 'AI asks', repo: false },
  { value: 'audit', label: 'Audit', short: 'Audit', repo: false },
  { value: 'settings', label: 'Settings', short: 'Settings', repo: false },
] as const

export type ModuleKey = (typeof MODULES)[number]['value']

/** The four a phone shows in its bottom bar; the rest are under "More". */
export const PHONE_NAV: ModuleKey[] = ['github', 'pulls', 'actions', 'inbox']
