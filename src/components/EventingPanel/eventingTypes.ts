/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/eventingTypes.ts

   Workflow data model + YAML helpers + DAG layout.
   Mirrors Mythic eventing parser.go shape so workflows
   serialize back to a form Mythic's importer accepts.
   ═══════════════════════════════════════════════════ */

import yaml from 'js-yaml'

// ─── Trigger and action enums (from parser.go) ─────
export const TRIGGERS = [
  'manual',
  'mythic_start',
  'cron',
  'keyword',
  'payload_build_start',
  'payload_build_finish',
  'task_create',
  'task_start',
  'task_finish',
  'task_intercept',
  'user_output',
  'response_intercept',
  'file_download',
  'file_upload',
  'callback_new',
  'callback_checkin',
  'screenshot',
  'alert',
  'tag_create',
] as const
export type TriggerType = (typeof TRIGGERS)[number]

export const ACTIONS = [
  'payload_create',
  'task_create',
  'callback_create',
  'task_intercept',
  'response_intercept',
  'conditional_check',
  'custom_function',
  'alert_create',
  'webhook_send',
] as const
export type ActionType = (typeof ACTIONS)[number]

export const RUN_AS_OPTIONS = ['self', 'bot', 'trigger', 'lead'] as const

// ─── Workflow shape (matches Mythic YAML) ─────────
export interface WorkflowStep {
  name: string
  description?: string
  action: ActionType
  action_data?: Record<string, unknown>
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  environment?: Record<string, unknown>
  depends_on?: string[]
  continue_on_error?: boolean
}

export interface Workflow {
  name: string
  description?: string
  trigger: TriggerType
  trigger_data?: Record<string, unknown>
  run_as?: string
  keywords?: string[]
  environment?: Record<string, unknown>
  steps: WorkflowStep[]
}

export function emptyWorkflow(name = 'new workflow'): Workflow {
  return {
    name,
    description: '',
    trigger: 'manual',
    trigger_data: {},
    run_as: 'self',
    keywords: [],
    environment: {},
    steps: [],
  }
}

// ─── YAML ↔ Workflow ──────────────────────────────
export function workflowToYaml(w: Workflow): string {
  // Strip empty fields for cleaner output
  const cleaned: Record<string, unknown> = {
    name: w.name,
    description: w.description ?? '',
    trigger: w.trigger,
  }
  if (w.trigger_data && Object.keys(w.trigger_data).length) cleaned.trigger_data = w.trigger_data
  if (w.run_as) cleaned.run_as = w.run_as
  if (w.keywords && w.keywords.length) cleaned.keywords = w.keywords
  if (w.environment && Object.keys(w.environment).length) cleaned.environment = w.environment
  cleaned.steps = w.steps.map((s) => {
    const step: Record<string, unknown> = {
      name: s.name,
      action: s.action,
    }
    if (s.description) step.description = s.description
    if (s.action_data && Object.keys(s.action_data).length) step.action_data = s.action_data
    if (s.inputs && Object.keys(s.inputs).length) step.inputs = s.inputs
    if (s.outputs && Object.keys(s.outputs).length) step.outputs = s.outputs
    if (s.environment && Object.keys(s.environment).length) step.environment = s.environment
    if (s.depends_on && s.depends_on.length) step.depends_on = s.depends_on
    if (s.continue_on_error) step.continue_on_error = s.continue_on_error
    return step
  })
  return yaml.dump(cleaned, { noRefs: true, lineWidth: 120, sortKeys: false })
}

export function yamlToWorkflow(text: string): Workflow {
  const parsed = yaml.load(text) as Record<string, unknown> | null
  if (!parsed || typeof parsed !== 'object') throw new Error('YAML must be an object')
  const steps = (parsed.steps as WorkflowStep[]) ?? []
  return {
    name: String(parsed.name ?? 'workflow'),
    description: String(parsed.description ?? ''),
    trigger: (parsed.trigger as TriggerType) ?? 'manual',
    trigger_data: (parsed.trigger_data as Record<string, unknown>) ?? {},
    run_as: String(parsed.run_as ?? 'self'),
    keywords: (parsed.keywords as string[]) ?? [],
    environment: (parsed.environment as Record<string, unknown>) ?? {},
    steps: steps.map((s) => ({
      name: String(s.name),
      description: s.description,
      action: s.action,
      action_data: s.action_data ?? {},
      inputs: s.inputs ?? {},
      outputs: s.outputs ?? {},
      environment: s.environment ?? {},
      depends_on: s.depends_on ?? [],
      continue_on_error: !!s.continue_on_error,
    })),
  }
}

// ─── Step name uniqueness + cycle detection ────────
export function validateWorkflow(w: Workflow): string[] {
  const errors: string[] = []
  const names = new Set<string>()
  for (const s of w.steps) {
    if (!s.name.trim()) errors.push('step has empty name')
    if (names.has(s.name)) errors.push(`duplicate step name: ${s.name}`)
    names.add(s.name)
  }
  for (const s of w.steps) {
    for (const dep of s.depends_on ?? []) {
      if (!names.has(dep)) errors.push(`step "${s.name}" depends on unknown step "${dep}"`)
    }
  }
  // Cycle detection (DFS)
  const adj = new Map<string, string[]>()
  for (const s of w.steps) adj.set(s.name, s.depends_on ?? [])
  const color = new Map<string, number>() // 0=unseen 1=visiting 2=done
  function visit(n: string): boolean {
    const c = color.get(n) ?? 0
    if (c === 2) return true
    if (c === 1) return false
    color.set(n, 1)
    for (const m of adj.get(n) ?? []) if (!visit(m)) return false
    color.set(n, 2)
    return true
  }
  for (const s of w.steps) {
    if (!visit(s.name)) {
      errors.push(`cycle detected involving step "${s.name}"`)
      break
    }
  }
  return errors
}

// ─── DAG layout: assign x,y based on order ─────────
export interface LayoutNode {
  id: string
  x: number
  y: number
  step: WorkflowStep
  layer: number
}

export function computeLayout(steps: WorkflowStep[]): LayoutNode[] {
  // Topological layering: order = max(parents.order)+1
  const layer = new Map<string, number>()
  const remaining = new Set(steps.map((s) => s.name))
  const stepByName = new Map(steps.map((s) => [s.name, s]))
  let safety = steps.length + 1
  while (remaining.size > 0 && safety-- > 0) {
    for (const name of Array.from(remaining)) {
      const s = stepByName.get(name)!
      const deps = s.depends_on ?? []
      if (deps.every((d) => layer.has(d) || !stepByName.has(d))) {
        const parentLayer = deps.reduce((m, d) => Math.max(m, (layer.get(d) ?? -1)), -1)
        layer.set(name, parentLayer + 1)
        remaining.delete(name)
      }
    }
  }
  // Anything left (cycle) gets layer 0
  for (const name of remaining) layer.set(name, 0)

  // Group by layer
  const byLayer = new Map<number, string[]>()
  for (const [name, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(name)
  }

  // Assign positions
  const COL_W = 240
  const ROW_H = 110
  const result: LayoutNode[] = []
  for (const [l, names] of byLayer) {
    names.sort()
    names.forEach((name, idx) => {
      result.push({
        id: name,
        x: l * COL_W,
        y: idx * ROW_H,
        step: stepByName.get(name)!,
        layer: l,
      })
    })
  }
  return result
}

// ─── Status helpers ────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  success:   '#90d880',
  running:   '#3ab8d8',
  error:     '#f07070',
  cancelled: '#d0a848',
  skipped:   '#a09068',
  queued:    '#887860',
}

export function statusColor(status: string | undefined): string {
  return STATUS_COLORS[status ?? ''] ?? '#887860'
}

// ─── Action defaults ───────────────────────────────
export function defaultActionData(action: ActionType): Record<string, unknown> {
  switch (action) {
    case 'payload_create':
      return { payload_type: '', selected_os: '', filename: '', commands: [], build_parameters: [], c2_profiles: [] }
    case 'task_create':
      return { callback_display_id: '', command_name: '', params: '' }
    case 'callback_create':
      return {}
    case 'task_intercept':
    case 'response_intercept':
    case 'custom_function':
      return { function_name: '', parameters: {} }
    case 'conditional_check':
      return { steps: [] as string[] }
    case 'alert_create':
      return { alert: '', source: 'eventing', level: 'info', sendWebhook: false }
    case 'webhook_send':
      return { webhook_data: {} }
    default:
      return {}
  }
}
