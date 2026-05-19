/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/StepInspector.tsx

   Right inspector for a selected step.
   Generic editor for name/desc/action + key-value editors
   for action_data, inputs, outputs.
   ═══════════════════════════════════════════════════ */

import { useState } from 'react'
import { ACTIONS, defaultActionData, type ActionType, type WorkflowStep } from './eventingTypes'
import styles from './EventingPanel.module.css'

interface KVEditorProps {
  label: string
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  placeholder?: { key: string; value: string }
}

function KVEditor({ label, value, onChange, placeholder }: KVEditorProps) {
  const entries = Object.entries(value ?? {})

  const updateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return
    const next: Record<string, unknown> = {}
    for (const [k, v] of entries) {
      if (k === oldKey) next[newKey] = v
      else next[k] = v
    }
    onChange(next)
  }
  const updateVal = (key: string, raw: string) => {
    onChange({ ...value, [key]: tryParse(raw) })
  }
  const remove = (key: string) => {
    const next = { ...value }
    delete next[key]
    onChange(next)
  }
  const add = () => {
    let i = 1
    let key = 'key'
    while (key in value) { key = `key${++i}` }
    onChange({ ...value, [key]: '' })
  }

  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>{label}</label>
      {entries.map(([k, v]) => (
        <div key={k} className={styles.kvRow}>
          <input
            className={`${styles.inspInput} ${styles.kvKey}`}
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
            placeholder={placeholder?.key ?? 'key'}
          />
          <input
            className={`${styles.inspInput} ${styles.kvValue}`}
            value={typeof v === 'string' ? v : JSON.stringify(v)}
            onChange={(e) => updateVal(k, e.target.value)}
            placeholder={placeholder?.value ?? 'value'}
          />
          <button className={styles.kvRemove} onClick={() => remove(k)} title="remove">
            ✕
          </button>
        </div>
      ))}
      <button className={styles.kvAdd} onClick={add}>+ add</button>
    </div>
  )
}

function tryParse(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed) } catch { return raw }
  }
  return raw
}

export interface StepInspectorProps {
  step: WorkflowStep
  allStepNames: string[]
  onChange: (next: WorkflowStep) => void
  onDelete: () => void
}

export function StepInspector({ step, allStepNames, onChange, onDelete }: StepInspectorProps) {
  const set = <K extends keyof WorkflowStep>(key: K, value: WorkflowStep[K]) =>
    onChange({ ...step, [key]: value })

  const otherStepNames = allStepNames.filter((n) => n !== step.name)
  const dependsOn = step.depends_on ?? []

  return (
    <div className={styles.stepInspector}>
      <div className={styles.inspectorHeader}>
        <span className={styles.inspectorTitle}>STEP</span>
        <button className={styles.dangerBtn} onClick={onDelete}>delete</button>
      </div>
      <div className={styles.inspectorBody}>
        <div className={styles.inspField}>
          <label className={styles.inspLabel}>Name</label>
          <input
            className={styles.inspInput}
            value={step.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>
        <div className={styles.inspField}>
          <label className={styles.inspLabel}>Description</label>
          <input
            className={styles.inspInput}
            value={step.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
        <div className={styles.inspField}>
          <label className={styles.inspLabel}>Action</label>
          <select
            className={styles.inspSelect}
            value={step.action}
            onChange={(e) => {
              const newAction = e.target.value as ActionType
              onChange({ ...step, action: newAction, action_data: defaultActionData(newAction) })
            }}
          >
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className={styles.inspField}>
          <label className={styles.inspLabel}>Depends On</label>
          <DependsOnPicker
            options={otherStepNames}
            value={dependsOn}
            onChange={(deps) => set('depends_on', deps)}
          />
        </div>
        <div className={styles.inspField}>
          <label className={styles.inspLabel}>
            <input
              type="checkbox"
              checked={!!step.continue_on_error}
              onChange={(e) => set('continue_on_error', e.target.checked)}
              style={{ marginRight: 6 }}
            />
            continue on error
          </label>
        </div>

        <ActionDataForm
          action={step.action}
          data={step.action_data ?? {}}
          onChange={(d) => set('action_data', d)}
        />

        <KVEditor
          label="Inputs"
          value={step.inputs ?? {}}
          onChange={(v) => set('inputs', v)}
          placeholder={{ key: 'VAR_NAME', value: 'env.field' }}
        />
        <KVEditor
          label="Outputs"
          value={step.outputs ?? {}}
          onChange={(v) => set('outputs', v)}
          placeholder={{ key: 'VAR_NAME', value: 'result_field' }}
        />
        <KVEditor
          label="Environment"
          value={step.environment ?? {}}
          onChange={(v) => set('environment', v)}
        />
      </div>
    </div>
  )
}

function DependsOnPicker({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((v) => v !== name))
    else onChange([...value, name])
  }
  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {value.map((v) => (
            <button
              key={v}
              className={styles.kvRemove}
              onClick={() => toggle(v)}
              style={{ padding: '2px 6px' }}
              title="remove"
            >
              {v} ✕
            </button>
          ))}
        </div>
      )}
      <select
        className={styles.inspSelect}
        value={draft}
        onChange={(e) => {
          if (e.target.value) {
            toggle(e.target.value)
            setDraft('')
          }
        }}
      >
        <option value="">+ add dependency</option>
        {options.filter((o) => !value.includes(o)).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

// ─── ActionDataForm: per-action-type config ─────────

function ActionDataForm({
  action,
  data,
  onChange,
}: {
  action: ActionType
  data: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  const set = (key: string, value: unknown) => onChange({ ...data, [key]: value })

  switch (action) {
    case 'task_create':
      return (
        <>
          <FieldText label="Callback Display ID" value={String(data.callback_display_id ?? '')}
            onChange={(v) => set('callback_display_id', tryParse(v))} placeholder="123 or env.display_id" />
          <FieldText label="Command Name" value={String(data.command_name ?? '')}
            onChange={(v) => set('command_name', v)} placeholder="shell" />
          <FieldTextarea label="Params (raw string)" value={String(data.params ?? '')}
            onChange={(v) => set('params', v)} placeholder='whoami /all' />
          <KVEditor label="Params Dictionary" value={(data.param_dictionary as Record<string, unknown>) ?? {}}
            onChange={(v) => set('param_dictionary', v)} />
        </>
      )
    case 'payload_create':
      return (
        <>
          <FieldText label="Payload Type" value={String(data.payload_type ?? '')}
            onChange={(v) => set('payload_type', v)} placeholder="apollo" />
          <FieldText label="Selected OS" value={String(data.selected_os ?? '')}
            onChange={(v) => set('selected_os', v)} placeholder="Windows" />
          <FieldText label="Filename" value={String(data.filename ?? '')}
            onChange={(v) => set('filename', v)} placeholder="apollo.exe" />
          <FieldText label="Description" value={String(data.description ?? '')}
            onChange={(v) => set('description', v)} />
          <FieldText label="Wrapped Payload UUID" value={String(data.wrapped_payload ?? '')}
            onChange={(v) => set('wrapped_payload', v)} placeholder="{{ output_var }}" />
          <FieldTextarea label="Commands (JSON array)"
            value={JSON.stringify(data.commands ?? [], null, 2)}
            onChange={(v) => { try { set('commands', JSON.parse(v)) } catch { /* ignore */ } }} />
          <FieldTextarea label="Build Parameters (JSON array)"
            value={JSON.stringify(data.build_parameters ?? [], null, 2)}
            onChange={(v) => { try { set('build_parameters', JSON.parse(v)) } catch { /* ignore */ } }} />
          <FieldTextarea label="C2 Profiles (JSON array)"
            value={JSON.stringify(data.c2_profiles ?? [], null, 2)}
            onChange={(v) => { try { set('c2_profiles', JSON.parse(v)) } catch { /* ignore */ } }} />
        </>
      )
    case 'conditional_check':
      return (
        <FieldTextarea label="Steps to skip (one per line)"
          value={((data.steps as string[]) ?? []).join('\n')}
          onChange={(v) => set('steps', v.split('\n').filter(Boolean))} />
      )
    case 'alert_create':
      return (
        <>
          <FieldTextarea label="Alert Message" value={String(data.alert ?? '')}
            onChange={(v) => set('alert', v)} />
          <FieldText label="Source" value={String(data.source ?? 'eventing')}
            onChange={(v) => set('source', v)} />
          <FieldSelect label="Level" value={String(data.level ?? 'info')}
            options={['debug', 'info', 'warning', 'error']}
            onChange={(v) => set('level', v)} />
          <FieldCheckbox label="Send Webhook" value={!!data.sendWebhook}
            onChange={(v) => set('sendWebhook', v)} />
          <KVEditor label="Webhook Alert" value={(data.webhook_alert as Record<string, unknown>) ?? {}}
            onChange={(v) => set('webhook_alert', v)} />
        </>
      )
    case 'webhook_send':
      return (
        <KVEditor label="Webhook Data" value={(data.webhook_data as Record<string, unknown>) ?? {}}
          onChange={(v) => set('webhook_data', v)} />
      )
    case 'custom_function':
    case 'task_intercept':
    case 'response_intercept':
      return (
        <>
          <FieldText label="Function Name" value={String(data.function_name ?? '')}
            onChange={(v) => set('function_name', v)} />
          <KVEditor label="Parameters" value={(data.parameters as Record<string, unknown>) ?? {}}
            onChange={(v) => set('parameters', v)} />
        </>
      )
    case 'callback_create':
      return (
        <KVEditor label="Action Data" value={data} onChange={onChange} />
      )
  }
}

function FieldText({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>{label}</label>
      <input className={styles.inspInput} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function FieldTextarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>{label}</label>
      <textarea className={styles.inspTextarea} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

function FieldSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>{label}</label>
      <select className={styles.inspSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function FieldCheckbox({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginRight: 6 }}
        />
        {label}
      </label>
    </div>
  )
}
