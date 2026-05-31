/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/WorkflowWizard.tsx

   Guided 3-step workflow builder (modal overlay).
     1. Metadata  — name / trigger (+ trigger_data) / run_as / keywords / env
     2. Steps     — per-step action, typed inputs, action_data, typed outputs, deps
     3. Review    — live YAML + validation, then Create (or hand to advanced editor)

   Produces a Workflow object that reuses eventingTypes so it
   serialises exactly like the advanced editor. The typed
   input/output editors are the improvement over Mythic's
   wizard — sources are picked from a vocabulary instead of
   typed as free strings.
   ═══════════════════════════════════════════════════ */

import { useMemo, useState } from 'react'
import { ActionDataForm } from './StepInspector'
import {
  ACTIONS,
  defaultActionData,
  validateWorkflow,
  workflowToYaml,
  type ActionType,
  type TriggerType,
  type Workflow,
  type WorkflowStep,
} from './eventingTypes'
import {
  ACTION_META,
  INPUT_TYPES,
  INPUT_TYPE_DESC,
  RUN_AS_META,
  RUN_AS_PRESETS,
  TRIGGER_META,
  WIZARD_TRIGGERS,
  flattenInputs,
  flattenOutputs,
  type InputType,
  type WizardInput,
  type WizardOutput,
} from './wizardData'
import styles from './EventingPanel.module.css'

interface WizStep {
  name: string
  description: string
  action: ActionType
  action_data: Record<string, unknown>
  inputs: WizardInput[]
  outputs: WizardOutput[]
  depends_on: string[]
  continue_on_error: boolean
}

interface WizState {
  name: string
  description: string
  trigger: TriggerType
  triggerData: Record<string, string> // raw text per param, converted on build
  runAsType: string
  runAsCustom: string
  keywords: string
  environment: string // raw JSON text
  steps: WizStep[]
}

const STEP_LABELS = ['Metadata', 'Steps', 'Review']

function emptyStep(existing: WizStep[]): WizStep {
  let base = 'step'
  let candidate = base
  let i = 1
  while (existing.find((s) => s.name === candidate)) candidate = `${base} ${++i}`
  return {
    name: candidate,
    description: '',
    action: 'task_create',
    action_data: defaultActionData('task_create'),
    inputs: [],
    outputs: [],
    depends_on: [],
    continue_on_error: false,
  }
}

// ─── build final Workflow from wizard state ───────────────
function buildWorkflow(st: WizState): { workflow: Workflow; errors: string[] } {
  const errors: string[] = []

  // trigger_data
  const triggerData: Record<string, unknown> = {}
  const meta = TRIGGER_META[st.trigger]
  for (const p of meta?.params ?? []) {
    const raw = (st.triggerData[p.name] ?? '').trim()
    if (!raw) continue
    if (p.kind === 'array') {
      triggerData[p.name] = raw.split(',').map((s) => s.trim()).filter(Boolean)
    } else if (p.kind === 'maparray') {
      try {
        triggerData[p.name] = JSON.parse(raw)
      } catch {
        errors.push(`trigger_data "${p.name}" is not valid JSON`)
      }
    } else {
      triggerData[p.name] = raw
    }
  }

  // environment
  let environment: Record<string, unknown> = {}
  const envText = st.environment.trim()
  if (envText) {
    try {
      const parsed = JSON.parse(envText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) environment = parsed
      else errors.push('environment must be a JSON object')
    } catch {
      errors.push('environment is not valid JSON')
    }
  }

  const steps: WorkflowStep[] = st.steps.map((s) => ({
    name: s.name,
    description: s.description,
    action: s.action,
    action_data: s.action_data,
    inputs: flattenInputs(s.inputs),
    outputs: flattenOutputs(s.outputs),
    depends_on: s.depends_on,
    continue_on_error: s.continue_on_error,
  }))

  const workflow: Workflow = {
    name: st.name || 'new workflow',
    description: st.description,
    trigger: st.trigger,
    trigger_data: triggerData,
    run_as: st.runAsCustom.trim() || st.runAsType,
    keywords: st.keywords.split(',').map((s) => s.trim()).filter(Boolean),
    environment,
    steps,
  }
  return { workflow, errors }
}

export interface WorkflowWizardProps {
  onCancel: () => void
  // Create immediately (upload). Receives YAML text.
  onCreate: (yamlText: string, name: string) => Promise<void>
  // Hand the assembled workflow to the advanced editor instead.
  onOpenInEditor: (w: Workflow) => void
  isSaving?: boolean
}

export function WorkflowWizard({ onCancel, onCreate, onOpenInEditor, isSaving }: WorkflowWizardProps) {
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [st, setSt] = useState<WizState>({
    name: '',
    description: '',
    trigger: 'manual',
    triggerData: {},
    runAsType: 'self',
    runAsCustom: '',
    keywords: '',
    environment: '',
    steps: [],
  })

  const patch = (p: Partial<WizState>) => setSt((s) => ({ ...s, ...p }))

  const built = useMemo(() => buildWorkflow(st), [st])
  const validation = useMemo(() => validateWorkflow(built.workflow), [built.workflow])
  const allErrors = [...built.errors, ...validation]
  const yamlText = useMemo(() => {
    try { return workflowToYaml(built.workflow) } catch { return '' }
  }, [built.workflow])

  const canAdvance = (): boolean => {
    if (active === 0) {
      if (!st.name.trim()) { setError('Workflow needs a name'); return false }
    }
    setError(null)
    return true
  }

  const next = () => { if (canAdvance()) setActive((a) => Math.min(a + 1, 2)) }
  const back = () => { setError(null); setActive((a) => Math.max(a - 1, 0)) }

  const create = async () => {
    if (allErrors.length) { setError('Fix validation errors before creating'); return }
    setError(null)
    try { await onCreate(yamlText, built.workflow.name) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className={styles.wizBackdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.wizModal}>
        {/* header / stepper */}
        <div className={styles.wizHeader}>
          <span className={styles.wizTitle}>WORKFLOW WIZARD</span>
          <div className={styles.wizStepper}>
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                className={`${styles.wizStepChip} ${i === active ? styles.wizStepChipActive : ''} ${i < active ? styles.wizStepChipDone : ''}`}
                onClick={() => { if (i < active || canAdvance()) setActive(i) }}
              >
                <span className={styles.wizStepNum}>{i + 1}</span>{label}
              </button>
            ))}
          </div>
          <button className={styles.wizClose} onClick={onCancel} title="close">✕</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.wizBody}>
          {active === 0 && <MetadataStep st={st} patch={patch} />}
          {active === 1 && <StepsStep st={st} patch={patch} />}
          {active === 2 && <ReviewStep yamlText={yamlText} errors={allErrors} />}
        </div>

        {/* footer nav */}
        <div className={styles.wizFooter}>
          <button className={styles.btn} onClick={onCancel}>Cancel</button>
          <div style={{ flex: 1 }} />
          {active === 2 && (
            <button
              className={styles.btn}
              onClick={() => onOpenInEditor(built.workflow)}
              title="Continue editing in the advanced DAG editor"
            >
              open in editor
            </button>
          )}
          <button className={styles.btn} onClick={back} disabled={active === 0}>back</button>
          {active < 2 ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>next</button>
          ) : (
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={create}
              disabled={isSaving || allErrors.length > 0}
            >
              {isSaving ? 'creating…' : 'create workflow'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══ Step 1: Metadata ═══════════════════════════════════
function MetadataStep({ st, patch }: { st: WizState; patch: (p: Partial<WizState>) => void }) {
  const meta = TRIGGER_META[st.trigger]
  const runAsIsCustom = st.runAsCustom.trim().length > 0
  const runAsDesc = runAsIsCustom ? RUN_AS_META.operator : RUN_AS_META[st.runAsType]

  return (
    <div className={styles.wizForm}>
      <Field label="Workflow Name" hint="A short, unique name.">
        <input className={styles.inspInput} value={st.name} placeholder="My Custom Workflow"
          onChange={(e) => patch({ name: e.target.value })} />
      </Field>

      <Field label="Description">
        <input className={styles.inspInput} value={st.description}
          onChange={(e) => patch({ description: e.target.value })} />
      </Field>

      <Field label="Trigger" hint={meta?.description}>
        <select className={styles.inspSelect} value={st.trigger}
          onChange={(e) => patch({ trigger: e.target.value as TriggerType, triggerData: {} })}>
          {WIZARD_TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      {(meta?.params ?? []).map((p) => (
        <Field key={p.name} label={`Trigger Data · ${p.name}`} hint={p.description}>
          {p.kind === 'maparray' ? (
            <textarea className={styles.inspTextarea} value={st.triggerData[p.name] ?? ''}
              placeholder={p.placeholder}
              onChange={(e) => patch({ triggerData: { ...st.triggerData, [p.name]: e.target.value } })} />
          ) : (
            <input className={styles.inspInput} value={st.triggerData[p.name] ?? ''}
              placeholder={p.placeholder ?? (p.kind === 'array' ? 'comma, separated, list' : '')}
              onChange={(e) => patch({ triggerData: { ...st.triggerData, [p.name]: e.target.value } })} />
          )}
        </Field>
      ))}

      <Field label="Run As" hint={runAsDesc}>
        <div style={{ display: 'flex', gap: 6 }}>
          <select className={styles.inspSelect} value={st.runAsType} disabled={runAsIsCustom}
            onChange={(e) => patch({ runAsType: e.target.value })} style={{ flex: 1 }}>
            {RUN_AS_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className={styles.inspInput} value={st.runAsCustom} placeholder="or specific operator…"
            onChange={(e) => patch({ runAsCustom: e.target.value })} style={{ flex: 1 }} />
        </div>
      </Field>

      <Field label="Keywords" hint="Comma-separated custom words that can trigger this workflow via API.">
        <input className={styles.inspInput} value={st.keywords} placeholder="keyword1, keyword2"
          onChange={(e) => patch({ keywords: e.target.value })} />
      </Field>

      <Field label="Environment (JSON)" hint="Global key/value pairs available to every step.">
        <textarea className={styles.inspTextarea} value={st.environment} placeholder="{ }" spellCheck={false}
          onChange={(e) => patch({ environment: e.target.value })} />
      </Field>
    </div>
  )
}

// ═══ Step 2: Steps ══════════════════════════════════════
function StepsStep({ st, patch }: { st: WizState; patch: (p: Partial<WizState>) => void }) {
  const setSteps = (steps: WizStep[]) => patch({ steps })
  const updateStep = (idx: number, p: Partial<WizStep>) => {
    const old = st.steps[idx]
    const merged = { ...old, ...p }
    setSteps(st.steps.map((s, i) => {
      if (i === idx) return merged
      // propagate rename to depends_on references
      if (p.name && p.name !== old.name) {
        return { ...s, depends_on: s.depends_on.map((d) => (d === old.name ? p.name! : d)) }
      }
      return s
    }))
  }
  const removeStep = (idx: number) => {
    const name = st.steps[idx].name
    setSteps(st.steps
      .filter((_, i) => i !== idx)
      .map((s) => ({ ...s, depends_on: s.depends_on.filter((d) => d !== name) })))
  }
  const addStep = () => setSteps([...st.steps, emptyStep(st.steps)])

  return (
    <div className={styles.wizForm}>
      <button className={styles.kvAdd} onClick={addStep}>+ add step</button>
      {st.steps.length === 0 && (
        <div className={styles.wizHintBig}>No steps yet. A workflow needs at least one step.</div>
      )}
      {st.steps.map((step, idx) => (
        <StepCard
          key={idx}
          step={step}
          index={idx}
          allSteps={st.steps}
          trigger={st.trigger}
          onChange={(p) => updateStep(idx, p)}
          onRemove={() => removeStep(idx)}
        />
      ))}
    </div>
  )
}

function StepCard({
  step, index, allSteps, trigger, onChange, onRemove,
}: {
  step: WizStep
  index: number
  allSteps: WizStep[]
  trigger: TriggerType
  onChange: (p: Partial<WizStep>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)
  const meta = ACTION_META[step.action]
  const otherNames = allSteps.filter((_, i) => i !== index).map((s) => s.name).filter(Boolean)
  // intercept actions only valid with matching trigger
  const actionOptions = ACTIONS.filter((a) => {
    if (a === 'task_intercept' && trigger !== 'task_intercept') return false
    if (a === 'response_intercept' && trigger !== 'response_intercept') return false
    return true
  })
  // step-output references available as inputs: <step>.<output>
  const outputRefs = allSteps
    .filter((_, i) => i !== index)
    .flatMap((s) => s.outputs.filter((o) => o.name).map((o) => `${s.name}.${o.name}`))

  return (
    <div className={styles.wizStepCard}>
      <div className={styles.wizStepCardHead}>
        <button className={styles.wizCollapse} onClick={() => setOpen((o) => !o)}>{open ? '▾' : '▸'}</button>
        <span className={styles.wizStepCardTitle}>{step.name || '(unnamed step)'}</span>
        <span className={styles.wizStepCardAction}>{step.action}</span>
        <div style={{ flex: 1 }} />
        <button className={styles.kvRemove} onClick={onRemove} title="remove step">✕</button>
      </div>

      {open && (
        <div className={styles.wizStepCardBody}>
          <div className={styles.wizRow2}>
            <Field label="Name">
              <input className={styles.inspInput} value={step.name}
                onChange={(e) => onChange({ name: e.target.value })} />
            </Field>
            <Field label="Description">
              <input className={styles.inspInput} value={step.description}
                onChange={(e) => onChange({ description: e.target.value })} />
            </Field>
          </div>

          <Field label="Action" hint={meta.description}>
            <select className={styles.inspSelect} value={step.action}
              onChange={(e) => {
                const a = e.target.value as ActionType
                onChange({ action: a, action_data: defaultActionData(a) })
              }}>
              {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>

          <div className={styles.wizSubHead}>Inputs</div>
          <div className={styles.wizHint}>Placeholders swapped into action data at run time.</div>
          <InputsEditor
            inputs={step.inputs}
            envFields={TRIGGER_META[trigger]?.env ?? []}
            outputRefs={outputRefs}
            onChange={(inputs) => onChange({ inputs })}
          />

          <div className={styles.wizSubHead}>Action Data</div>
          <ActionDataForm
            action={step.action}
            data={step.action_data}
            onChange={(action_data) => onChange({ action_data })}
          />

          <div className={styles.wizSubHead}>Outputs</div>
          <div className={styles.wizHint}>Expose values for later steps to reference.</div>
          <OutputsEditor
            outputs={step.outputs}
            fields={meta.outputFields}
            onChange={(outputs) => onChange({ outputs })}
          />

          <Field label="Depends On" hint="Steps that must finish before this one runs.">
            <DepsPicker options={otherNames} value={step.depends_on}
              onChange={(depends_on) => onChange({ depends_on })} />
          </Field>

          <label className={styles.inspLabel} style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none' }}>
            <input type="checkbox" checked={step.continue_on_error}
              onChange={(e) => onChange({ continue_on_error: e.target.checked })} />
            continue on error
          </label>
        </div>
      )}
    </div>
  )
}

// ─── typed inputs editor ──────────────────────────────────
function InputsEditor({
  inputs, envFields, outputRefs, onChange,
}: {
  inputs: WizardInput[]
  envFields: string[]
  outputRefs: string[]
  onChange: (next: WizardInput[]) => void
}) {
  const update = (i: number, p: Partial<WizardInput>) =>
    onChange(inputs.map((inp, idx) => (idx === i ? { ...inp, ...p } : inp)))
  const remove = (i: number) => onChange(inputs.filter((_, idx) => idx !== i))
  const add = () => onChange([...inputs, { name: '', type: 'env', value: '', envField: envFields[0] ?? '' }])

  return (
    <div>
      {inputs.map((inp, i) => (
        <div key={i} className={styles.wizIoRow}>
          <input className={styles.inspInput} placeholder="input name" value={inp.name}
            onChange={(e) => update(i, { name: e.target.value })} style={{ flex: '0 0 26%' }} />
          <select className={styles.inspSelect} value={inp.type} style={{ flex: '0 0 22%' }}
            onChange={(e) => {
              const type = e.target.value as InputType
              update(i, {
                type,
                value: type === 'mythic' ? 'apitoken' : type === 'output' ? (outputRefs[0] ?? '') : '',
                envField: type === 'env' ? (envFields[0] ?? '') : inp.envField,
              })
            }}>
            {INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {inp.type === 'env' && envFields.length > 0 ? (
            <select className={styles.inspSelect} value={inp.value || inp.envField} style={{ flex: 1 }}
              onChange={(e) => update(i, { envField: e.target.value, value: '' })}>
              {envFields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : inp.type === 'output' ? (
            <select className={styles.inspSelect} value={inp.value} style={{ flex: 1 }}
              onChange={(e) => update(i, { value: e.target.value })}>
              <option value="">— select step output —</option>
              {outputRefs.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input className={styles.inspInput} value={inp.value} style={{ flex: 1 }}
              placeholder={inp.type === 'custom' ? 'literal value' : `${inp.type} name`}
              onChange={(e) => update(i, { value: e.target.value })} />
          )}
          <button className={styles.kvRemove} onClick={() => remove(i)} title="remove">✕</button>
        </div>
      ))}
      {inputs.length > 0 && (
        <div className={styles.wizHint}>{INPUT_TYPE_DESC[inputs[inputs.length - 1].type]}</div>
      )}
      <button className={styles.kvAdd} onClick={add}>+ add input</button>
    </div>
  )
}

// ─── typed outputs editor ─────────────────────────────────
function OutputsEditor({
  outputs, fields, onChange,
}: {
  outputs: WizardOutput[]
  fields: string[]
  onChange: (next: WizardOutput[]) => void
}) {
  const update = (i: number, p: Partial<WizardOutput>) =>
    onChange(outputs.map((o, idx) => (idx === i ? { ...o, ...p } : o)))
  const remove = (i: number) => onChange(outputs.filter((_, idx) => idx !== i))
  const add = () => onChange([...outputs, { name: '', field: fields[0] ?? '', value: '' }])

  return (
    <div>
      {outputs.map((o, i) => (
        <div key={i} className={styles.wizIoRow}>
          <input className={styles.inspInput} placeholder="output name" value={o.name}
            onChange={(e) => update(i, { name: e.target.value })} style={{ flex: '0 0 30%' }} />
          {fields.length > 0 ? (
            <select className={styles.inspSelect} value={o.value ? '' : o.field} style={{ flex: 1 }}
              disabled={!!o.value}
              onChange={(e) => update(i, { field: e.target.value })}>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : null}
          <input className={styles.inspInput} value={o.value} style={{ flex: 1 }}
            placeholder={fields.length ? 'or custom value' : 'custom value'}
            onChange={(e) => update(i, { value: e.target.value })} />
          <button className={styles.kvRemove} onClick={() => remove(i)} title="remove">✕</button>
        </div>
      ))}
      <button className={styles.kvAdd} onClick={add}>+ add output</button>
    </div>
  )
}

function DepsPicker({
  options, value, onChange,
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (n: string) =>
    onChange(value.includes(n) ? value.filter((v) => v !== n) : [...value, n])
  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {value.map((v) => (
            <button key={v} className={styles.kvRemove} style={{ padding: '2px 6px' }} onClick={() => toggle(v)}>
              {v} ✕
            </button>
          ))}
        </div>
      )}
      <select className={styles.inspSelect} value=""
        onChange={(e) => { if (e.target.value) toggle(e.target.value) }}>
        <option value="">+ add dependency</option>
        {options.filter((o) => !value.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ═══ Step 3: Review ═════════════════════════════════════
function ReviewStep({ yamlText, errors }: { yamlText: string; errors: string[] }) {
  return (
    <div className={styles.wizReview}>
      {errors.length > 0 ? (
        <div className={styles.validList}>
          {errors.map((e, i) => <div key={i} className={styles.validItem}>⚠ {e}</div>)}
        </div>
      ) : (
        <div className={styles.wizOk}>✓ Workflow looks valid. Review the YAML below, then create.</div>
      )}
      <pre className={styles.wizYaml}>{yamlText}</pre>
    </div>
  )
}

// ─── small field wrapper ──────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={styles.inspField}>
      <label className={styles.inspLabel}>{label}</label>
      {children}
      {hint && <div className={styles.wizHint}>{hint}</div>}
    </div>
  )
}
