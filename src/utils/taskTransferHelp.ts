import type { TaskTransferCollection } from '@/utils/taskTransfer'

export interface TaskTransferSchemaField {
  field: string
  scope: 'document' | 'item'
  type: string
  required: boolean
  example: string
  notes: string
}

export const TASK_TRANSFER_SCHEMA_FIELDS: TaskTransferSchemaField[] = [
  {
    field: 'collection',
    scope: 'document',
    type: '"tasks" | "todos"',
    required: false,
    example: '"tasks"',
    notes: 'Chooses which list to create. If it is missing, pasted JSON imports as tasks.',
  },
  {
    field: 'project',
    scope: 'document',
    type: 'string',
    required: false,
    example: '"Aquakart Growth & Sales Conversion"',
    notes: 'A readable name for the file. It is kept for humans and does not become a task.',
  },
  {
    field: 'items',
    scope: 'document',
    type: 'array',
    required: true,
    example: '[{ "title": "Real Lead Backend" }]',
    notes: 'Each item becomes one task or todo. Blank titles are skipped.',
  },
  {
    field: 'id',
    scope: 'item',
    type: 'string | number',
    required: false,
    example: '"AK-GROW-001"',
    notes: 'Used only to rebuild parent-child nesting during import. It is not kept as the app id.',
  },
  {
    field: 'parentSourceId',
    scope: 'item',
    type: 'string | number | null',
    required: false,
    example: '"AK-GROW-001"',
    notes: 'Points this item under another imported item. `parentId` is accepted too.',
  },
  {
    field: 'title',
    scope: 'item',
    type: 'string',
    required: true,
    example: '"Real Lead Backend"',
    notes: '`text` and `name` are also accepted. This becomes the task title or todo text.',
  },
  {
    field: 'description',
    scope: 'item',
    type: 'string',
    required: false,
    example: '"Create the Lead model and API routes."',
    notes: 'Becomes task notes or todo description. `notes` and `note` are also accepted.',
  },
  {
    field: 'testCriteria',
    scope: 'item',
    type: 'string[]',
    required: false,
    example: '["Create a lead", "Refresh and lead remains"]',
    notes: 'Appended under the description so acceptance checks are not lost.',
  },
  {
    field: 'area',
    scope: 'item',
    type: 'string',
    required: false,
    example: '"CRM"',
    notes: 'Used as the item tag. `tag` is accepted too, and wins when both are present.',
  },
  {
    field: 'status',
    scope: 'item',
    type: 'string',
    required: false,
    example: '"not_started"',
    notes: 'Accepts pending/progress/done plus not_started, in_development and tested_complete.',
  },
  {
    field: 'progress',
    scope: 'item',
    type: 'number',
    required: false,
    example: '75',
    notes: 'Used only when status is missing: 0 is pending, 1-99 is progress, 100 is done.',
  },
  {
    field: 'priority',
    scope: 'item',
    type: 'string',
    required: false,
    example: '"P0"',
    notes: 'For tasks only. P0 becomes high, P1 normal, P2 low. high/normal/low work directly.',
  },
  {
    field: 'deadline',
    scope: 'item',
    type: 'string - YYYY-MM-DD',
    required: false,
    example: '"2026-10-02"',
    notes: 'For tasks only. `due` and `dueAt` are also accepted.',
  },
]

export const SAMPLE_TASKS_JSON = `{
  "collection": "tasks",
  "project": "Aquakart Growth & Sales Conversion",
  "version": "1.0",
  "goal": "Build a complete visitor-to-lead-to-sale-to-service-to-referral system.",
  "items": [
    {
      "id": "AK-GROW-001",
      "priority": "P0",
      "area": "CRM",
      "title": "Real Lead Backend",
      "description": "Create a proper Lead model, controller, routes and database persistence. Connect the existing CRM Leads UI to real Aquakart backend APIs.",
      "progress": 0,
      "status": "not_started",
      "testCriteria": [
        "Create a lead from CRM",
        "Lead persists in database",
        "Refresh CRM and lead remains"
      ]
    },
    {
      "id": "AK-GROW-002",
      "parentSourceId": "AK-GROW-001",
      "priority": "P0",
      "area": "CRM",
      "title": "Sales Activities Backend",
      "description": "Create activities for calls, WhatsApp, email, site visits, follow-ups and reminders linked to leads, customers and deals.",
      "progress": 50,
      "status": "in_development",
      "testCriteria": [
        "Create activity",
        "Link activity to lead",
        "Mark completed"
      ]
    },
    {
      "id": "AK-GROW-003",
      "priority": "P1",
      "area": "Website",
      "title": "Reusable Enquiry Form",
      "description": "Complete the existing enquiry form component with name, phone, locality and water problem fields.",
      "deadline": "2026-10-02",
      "status": "pending"
    }
  ]
}`

export const SAMPLE_TODOS_JSON = `{
  "collection": "todos",
  "project": "Launch checklist",
  "items": [
    {
      "id": "TODO-001",
      "area": "Setup",
      "title": "Confirm launch owner",
      "description": "Pick the person responsible for the release checklist.",
      "status": "pending"
    },
    {
      "id": "TODO-002",
      "parentSourceId": "TODO-001",
      "area": "Setup",
      "title": "Share launch notes",
      "description": "Send the final notes to the team.",
      "status": "done"
    }
  ]
}`

export function sampleTaskTransferJson(collection: TaskTransferCollection): string {
  return collection === 'todos' ? SAMPLE_TODOS_JSON : SAMPLE_TASKS_JSON
}

export function taskTransferSampleFilename(collection: TaskTransferCollection): string {
  return collection === 'todos' ? 'todos-sample.json' : 'tasks-sample.json'
}
