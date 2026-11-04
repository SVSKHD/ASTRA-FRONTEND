// What the Aureon server can do, as it reports it (GET /api/v1/capabilities, backend
// docs/26): its tools (agents, integrations and the operations that need approval), the
// services it is connected to, and MCP. Nothing is assumed installed: a tool is listed
// only when the server lists it, and MCP shows as unsupported while the server says so.
//
// Newer than the generated client, so it goes through it untyped; a server without the
// endpoint answers 404 and the hub says the registry is not on that server yet.

import { callView } from '@/modules/request'

export type ToolStatus = 'ready' | 'unconfigured' | 'paused' | 'down' | 'unknown'

export interface CapabilityTool {
  id: string
  name: string
  kind: 'agent' | 'integration' | 'operation' | string
  status: ToolStatus | string
  detail: string | null
  requires_approval: boolean
}
export interface CapabilityService {
  id: string
  name: string
  connected: boolean
  detail: string | null
}
export interface McpServer {
  id: string
  name: string
  connected: boolean
}
export interface Capabilities {
  mcp: { supported: boolean; servers: McpServer[] }
  tools: CapabilityTool[]
  services: CapabilityService[]
}

export type CapabilitiesResult =
  { ok: true; data: Capabilities } | { ok: false; missing: boolean; error: string }

export async function loadCapabilities(): Promise<CapabilitiesResult> {
  const r = await callView({ method: 'GET', path: '/api/v1/capabilities' })
  if (r.ok) return { ok: true, data: r.data as Capabilities }
  return { ok: false, missing: r.status === 404, error: r.error }
}

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ready: 'success',
  unconfigured: 'warning',
  paused: 'warning',
  down: 'danger',
  unknown: 'neutral',
}

export const KIND_LABEL: Record<string, string> = {
  agent: 'Agents',
  integration: 'Integrations',
  operation: 'Operations that need approval',
}

/** Tools grouped by kind, in a stable order, each group sorted by name. */
export function groupTools(
  tools: CapabilityTool[],
): { kind: string; label: string; tools: CapabilityTool[] }[] {
  const order = ['agent', 'integration', 'operation']
  const kinds = [...new Set(tools.map((t) => t.kind))].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b),
  )
  return kinds.map((kind) => ({
    kind,
    label: KIND_LABEL[kind] ?? kind,
    tools: tools.filter((t) => t.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
  }))
}
