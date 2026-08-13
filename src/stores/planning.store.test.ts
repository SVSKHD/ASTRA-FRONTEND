import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

describe('planning boards — model + sync', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('creates a board, adds nodes, and persists their positions (12)', () => {
    const app = useAppStore()
    const board = app.addBoard('Plan', 'tree')
    const n = app.addNode(board, 'idea', 'First')
    app.moveNode(n, 320, 140)
    const node = app.nodeById(n)!
    expect(node.boardId).toBe(board)
    expect(node).toMatchObject({ x: 320, y: 140 })
    expect(app.nodesOfBoard(board).map((x) => x.id)).toEqual([n])
    // A move bumps localRev so the sync guard can spot a stale write.
    expect(node.localRev).toBe(1)
  })

  it('group-moves nodes in one batch', () => {
    const app = useAppStore()
    const board = app.addBoard('Plan')
    const a = app.addNode(board)
    const b = app.addNode(board)
    app.moveNodes([
      { id: a, x: 10, y: 10 },
      { id: b, x: 20, y: 20 },
    ])
    expect(app.nodeById(a)).toMatchObject({ x: 10, y: 10 })
    expect(app.nodeById(b)).toMatchObject({ x: 20, y: 20 })
  })
})

describe('planning boards — convert / link (13)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('converts a node to a task that appears in the tasks list and back-links', () => {
    const app = useAppStore()
    const board = app.addBoard('Plan')
    const n = app.addNode(board, 'idea', 'Ship it')
    const taskId = app.convertNodeToTask(n)!
    // The real task exists in the Tasks list.
    const task = app.tasks.find((t) => t.id === taskId)!
    expect(task.title).toBe('Ship it')
    // The node now mirrors it, and the task carries a back-reference.
    expect(app.nodeById(n)).toMatchObject({ linkedType: 'task', linkedId: taskId })
    expect(task.graphRefs?.some((r) => r.nodeId === n && r.relation === 'mirror')).toBe(true)
  })
})

describe('planning boards — parent edge writes task hierarchy (14, 15)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function twoLinkedNodes() {
    const app = useAppStore()
    const board = app.addBoard('Plan')
    const parentNode = app.addNode(board, 'task', 'Parent')
    const childNode = app.addNode(board, 'task', 'Child')
    const parentTask = app.convertNodeToTask(parentNode)!
    const childTask = app.convertNodeToTask(childNode)!
    return { app, board, parentNode, childNode, parentTask, childTask }
  }

  it("a 'parent' edge sets the child task's parentId (14)", () => {
    const { app, board, parentNode, childNode, parentTask, childTask } = twoLinkedNodes()
    const res = app.addEdge(board, parentNode, childNode, 'parent')
    expect(res.ok).toBe(true)
    expect(app.tasks.find((t) => t.id === childTask)!.parentId).toBe(parentTask)
    expect(app.edgesOfBoard(board).length).toBe(1)
  })

  it('rejects a parent edge that would cycle the task tree — no write (15)', () => {
    const { app, board, parentNode, childNode } = twoLinkedNodes()
    // Make child a parent of parent first.
    expect(app.addEdge(board, parentNode, childNode, 'parent').ok).toBe(true)
    // Now the reverse edge would loop the task tree.
    const res = app.addEdge(board, childNode, parentNode, 'parent')
    expect(res).toEqual({ ok: false, reason: 'cycle' })
    // Only the first edge exists.
    expect(app.edgesOfBoard(board).length).toBe(1)
  })
})
