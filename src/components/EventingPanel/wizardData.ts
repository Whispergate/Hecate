/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/wizardData.ts

   Static metadata that powers the guided workflow wizard:
   per-trigger descriptions + trigger_data params + env
   fields, per-action descriptions + output fields, and the
   typed-input vocabulary. Mirrors Mythic's
   CreateEventingStepper.js so generated workflows match the
   importer's expectations.
   ═══════════════════════════════════════════════════ */

import type { ActionType, TriggerType } from './eventingTypes'

// ─── Env field catalogs (what a trigger makes available) ──
// Sorted to match Mythic's UI ordering.
const taskFields = [
  'agent_task_id', 'apitokens_id', 'callback_id', 'command_id', 'command_name', 'comment',
  'comment_operator_id', 'completed', 'completed_callback_function', 'completed_callback_function_completed',
  'display_id', 'display_params', 'eventstepinstance_id', 'group_callback_function',
  'group_callback_function_completed', 'has_intercepted_response', 'id', 'interactive_task_type',
  'is_interactive_task', 'operation_id', 'operator_id', 'opsec_post_blocked', 'opsec_post_bypass_role',
  'opsec_post_bypass_user_id', 'opsec_post_bypassed', 'opsec_post_message', 'opsec_pre_blocked',
  'opsec_pre_bypass_role', 'opsec_pre_bypass_user_id', 'opsec_pre_bypassed', 'opsec_pre_message',
  'original_params', 'parameter_group_name', 'params', 'parent_task_id', 'response_count', 'status',
  'status_timestamp_preprocessing', 'status_timestamp_processed', 'status_timestamp_processing',
  'status_timestamp_submitted', 'stderr', 'stdout', 'subtask_callback_function',
  'subtask_callback_function_completed', 'subtask_group_name', 'tasking_location', 'timestamp', 'token_id',
]
const payloadFields = [
  'apitokens_id', 'auto_generated', 'build_container', 'build_message', 'build_phase', 'build_stderr',
  'build_stdout', 'callback_alert', 'creation_time', 'deleted', 'description', 'eventstepinstance_id',
  'file_id', 'id', 'operation_id', 'operator_id', 'os', 'payload_type_id', 'task_id', 'timestamp', 'uuid',
  'wrapped_payload_id',
]
const callbackFields = [
  'active', 'agent_callback_id', 'architecture', 'color', 'crypto_type', 'dead', 'dec_key', 'description',
  'display_id', 'domain', 'enc_key', 'eventstepinstance_id', 'external_ip', 'extra_info', 'host', 'id',
  'init_callback', 'integrity_level', 'ip', 'last_checkin', 'locked', 'locked_operator_id',
  'mythictree_groups', 'operation_id', 'operator_id', 'os', 'pid', 'process_name', 'process_short_name',
  'registered_payload_id', 'sleep_info', 'timestamp', 'trigger_on_checkin_after_time', 'user',
]
const tagFields = [
  'credential_id', 'data', 'filemeta_id', 'id', 'keylog_id', 'mythictree_id', 'operation_id',
  'response_id', 'source', 'task_id', 'taskartifact_id', 'tagtype', 'url',
]

// ─── Trigger-data param spec ──────────────────────────────
export type TriggerParamKind = 'cron' | 'array' | 'maparray'
export interface TriggerParamSpec {
  name: string
  kind: TriggerParamKind
  description: string
  placeholder?: string
}

export interface TriggerMeta {
  description: string
  params: TriggerParamSpec[]
  env: string[]
}

const arrayParam = (name: string, description: string): TriggerParamSpec => ({
  name, kind: 'array', description,
})
const payloadTypesParam = arrayParam(
  'payload_types',
  'List of payload types to trigger on. Empty = all payload types.',
)
const selectedOsParam = arrayParam(
  'selected_os',
  'List of OS values to trigger on. Empty = all.',
)
const commandsMapParam: TriggerParamSpec = {
  name: 'payload_types_commands',
  kind: 'maparray',
  description:
    'JSON map of payload type → list of command names to trigger on. Empty list for a type = all its commands. Empty map = everything.',
  placeholder: '{ "apollo": ["shell", "ls"] }',
}

// Only triggers exposed by Mythic's wizard. Order matches its sorted dropdown.
export const TRIGGER_META: Partial<Record<TriggerType, TriggerMeta>> = {
  manual: {
    description: 'Triggered manually in the UI via the green run icon.',
    params: [], env: [],
  },
  mythic_start: {
    description: 'Triggered when Mythic starts up.',
    params: [], env: [],
  },
  cron: {
    description: 'Triggered on a cron schedule.',
    params: [{
      name: 'cron', kind: 'cron',
      description: 'Standard cron string for when to run. See https://crontab.guru/',
      placeholder: '0 2 * * *',
    }],
    env: [],
  },
  payload_build_start: {
    description: 'Triggered when a payload first starts building.',
    params: [payloadTypesParam, selectedOsParam], env: payloadFields,
  },
  payload_build_finish: {
    description: 'Triggered when a payload finishes building (success or error).',
    params: [payloadTypesParam, selectedOsParam], env: payloadFields,
  },
  task_create: {
    description: 'Triggered when a task is created and sent for preprocessing.',
    params: [commandsMapParam], env: taskFields,
  },
  task_start: {
    description: 'Triggered when a task is picked up by the agent to start executing.',
    params: [commandsMapParam], env: taskFields,
  },
  task_finish: {
    description: 'Triggered when a task finishes (success or error).',
    params: [commandsMapParam], env: taskFields,
  },
  task_intercept: {
    description:
      'Triggered after a task finishes its opsec_post check for one last chance to block it. Requires a task_intercept step.',
    params: [commandsMapParam], env: taskFields,
  },
  response_intercept: {
    description:
      'Triggered when a task returns user_output, before it is saved — lets you modify it first. Requires a response_intercept step.',
    params: [], env: [],
  },
  user_output: {
    description: "Triggered when a task returns new 'user_output' for the operator to see.",
    params: [], env: [],
  },
  file_download: {
    description: 'Triggered when a file finishes downloading from a callback to Mythic.',
    params: [], env: [],
  },
  file_upload: {
    description: 'Triggered when a file finishes uploading from Mythic to an agent.',
    params: [], env: [],
  },
  callback_new: {
    description: 'Triggered when a new callback is created.',
    params: [payloadTypesParam, selectedOsParam], env: callbackFields,
  },
  callback_checkin: {
    description:
      'Triggered when a callback with a trigger threshold checks in after being late by ≥ that threshold.',
    params: [payloadTypesParam, selectedOsParam],
    env: [...callbackFields, 'previous_checkin', 'checkin_difference'].sort(),
  },
  screenshot: {
    description: 'Triggered when a task finishes sending a screenshot back to Mythic.',
    params: [], env: [],
  },
  alert: {
    description: 'Triggered when an agent sends an alert back to Mythic.',
    params: [], env: [],
  },
  tag_create: {
    description: 'Triggered when a new tag is created.',
    params: [arrayParam('tag_types', 'List of tag type names to trigger on. Empty = all.')],
    env: tagFields,
  },
}

export const WIZARD_TRIGGERS = Object.keys(TRIGGER_META) as TriggerType[]

// ─── run_as ───────────────────────────────────────────────
export const RUN_AS_META: Record<string, string> = {
  self: 'Runs as the operator who uploaded it (you).',
  bot: "Runs as the operation's bot account. The operation admin must approve it to run.",
  trigger: 'Runs as whoever triggered it (or bot if no explicit trigger). Each operator must grant consent.',
  lead: 'Runs as the operation admin, who must approve before it can execute.',
  operator: 'A named operator: they must be in the operation and have granted consent.',
}
export const RUN_AS_PRESETS = ['self', 'bot', 'trigger', 'lead'] as const

// ─── Action metadata ──────────────────────────────────────
export interface ActionMeta {
  description: string
  outputFields: string[]
}
export const ACTION_META: Record<ActionType, ActionMeta> = {
  payload_create: {
    description: 'Build a payload. The step finishes once the build completes (success or error).',
    outputFields: payloadFields,
  },
  task_create: {
    description: 'Issue a new task. The step finishes once the task finishes (success or error).',
    outputFields: taskFields,
  },
  callback_create: {
    description: 'Create a new callback.',
    outputFields: callbackFields,
  },
  custom_function: {
    description:
      'Run a custom function inside an event container you install. Combined with a mythic.apitoken input this gives full GraphQL/Scripting access.',
    outputFields: [],
  },
  conditional_check: {
    description:
      'Run custom code to decide whether to skip certain steps instead of failing the whole workflow.',
    outputFields: [],
  },
  task_intercept: {
    description:
      'Intercept a task after opsec_post for one final chance to block it. Only valid with the task_intercept trigger.',
    outputFields: [],
  },
  response_intercept: {
    description:
      "Intercept an agent's user_output before it reaches the UI so you can modify it. Only valid with the response_intercept trigger.",
    outputFields: [],
  },
  alert_create: {
    description: 'Create a new alert. Finishes immediately.',
    outputFields: [],
  },
  webhook_send: {
    description: 'Send a custom webhook message. Finishes immediately.',
    outputFields: [],
  },
}

// ─── Typed inputs ─────────────────────────────────────────
// An input maps a NAME used inside action_data to a source value.
export const INPUT_TYPES = ['env', 'output', 'upload', 'download', 'workflow', 'mythic', 'custom'] as const
export type InputType = (typeof INPUT_TYPES)[number]

export const INPUT_TYPE_DESC: Record<InputType, string> = {
  env: 'Pull a value from the environment / the data that triggered the workflow.',
  output: "Reference a previous step's output by <step>.<output_name>.",
  upload: 'Name of a file uploaded to Mythic → resolves to its agent_file_id (or "").',
  download: 'Name of a file downloaded to Mythic → resolves to its agent_file_id (or "").',
  workflow: 'Name of a file attached to this workflow (paperclip icon).',
  mythic: 'Get info Mythic exposes nowhere else. Currently limited to apitoken.',
  custom: 'A completely custom literal value of your choosing.',
}

// Wizard's internal richer input/output rows (flattened on export).
export interface WizardInput {
  name: string
  type: InputType
  value: string      // free text value / output ref / custom literal
  envField: string   // selected env field when type === 'env' and value empty
}
export interface WizardOutput {
  name: string
  field: string      // selected output field
  value: string      // custom override (wins over field)
}

// Flatten wizard inputs → Mythic inputs dict ({ NAME: "env.field" })
export function flattenInputs(inputs: WizardInput[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of inputs) {
    if (!i.name) continue
    if (i.type === 'custom') {
      out[i.name] = i.value
    } else if (i.type === 'output') {
      // value already holds the <step>.<field> reference
      out[i.name] = i.value
    } else if (i.type === 'env') {
      out[i.name] = 'env.' + (i.value || i.envField)
    } else if (i.type === 'mythic') {
      out[i.name] = 'mythic.' + (i.value || 'apitoken')
    } else {
      // upload / download / workflow
      out[i.name] = i.type + '.' + i.value
    }
  }
  return out
}

// Parse Mythic inputs dict → wizard rows (best-effort, for "open in wizard")
export function parseInputs(dict: Record<string, unknown>): WizardInput[] {
  return Object.entries(dict ?? {}).map(([name, raw]) => {
    const v = String(raw ?? '')
    const dot = v.indexOf('.')
    const prefix = dot >= 0 ? v.slice(0, dot) : ''
    const rest = dot >= 0 ? v.slice(dot + 1) : ''
    if (prefix === 'env') return { name, type: 'env', value: '', envField: rest }
    if ((INPUT_TYPES as readonly string[]).includes(prefix) && prefix !== 'custom') {
      return { name, type: prefix as InputType, value: rest, envField: '' }
    }
    // Looks like a step output ref (<step>.<field>) when there's a dot but unknown prefix
    if (dot >= 0) return { name, type: 'output', value: v, envField: '' }
    return { name, type: 'custom', value: v, envField: '' }
  })
}

export function flattenOutputs(outputs: WizardOutput[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const o of outputs) {
    if (!o.name) continue
    out[o.name] = o.value || o.field
  }
  return out
}
export function parseOutputs(dict: Record<string, unknown>): WizardOutput[] {
  return Object.entries(dict ?? {}).map(([name, raw]) => ({
    name, field: '', value: String(raw ?? ''),
  }))
}
