/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/WorkflowEditor.tsx

   Editor tab content. Three sub-tabs:
   - Definition: trigger meta + DAG + step palette + inspector
   - YAML: raw text editor (synced)
   - Instances: live execution viewer

   Single source of truth = `workflow` state object in
   parent EventingPanel. YAML view round-trips to text.
   ═══════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { DagView } from './DagView'
import { StepInspector } from './StepInspector'
import {
  ACTIONS,
  RUN_AS_OPTIONS,
  TRIGGERS,
  defaultActionData,
  validateWorkflow,
  workflowToYaml,
  yamlToWorkflow,
  type ActionType,
  type Workflow,
  type WorkflowStep,
} from './eventingTypes'
import { InstanceView } from './InstanceView'
import styles from './EventingPanel.module.css'

type Tab = 'definition' | 'yaml' | 'instances'

export interface WorkflowEditorProps {
  workflow: Workflow
  onChange: (next: Workflow) => void
  // Save action — receives YAML string for upload
  onSave: (yamlText: string) => Promise<void>
  onRun?: () => Promise<void>
  onDelete?: () => Promise<void>
  // null when this is a draft (not yet saved)
  eventgroupId: number | null
  // Triggers tab switch externally (e.g. after save)
  initialTab?: Tab
  isSaving?: boolean
  isRunning?: boolean
  isDirty?: boolean
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  const { workflow, onChange } = props
  const [tab, setTab] = useState<Tab>(props.initialTab ?? 'definition')
  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const [yamlText, setYamlText] = useState<string>(() => workflowToYaml(workflow))
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // When workflow object changes externally, refresh yaml view
  useEffect(() => {
    if (tab !== 'yaml') setYamlText(workflowToYaml(workflow))
  }, [workflow, tab])

  const validation = validateWorkflow(workflow)

  const handleYamlChange = (next: string) => {
    setYamlText(next)
    try {
      const parsed = yamlToWorkflow(next)
      onChange(parsed)
      setYamlError(null)
    } catch (e) {
      setYamlError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSave = async () => {
    setError(null)
    try {
      const yamlOut = workflowToYaml(workflow)
      await props.onSave(yamlOut)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleRun = async () => {
    if (!props.onRun) return
    setError(null)
    try {
      await props.onRun()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async () => {
    if (!props.onDelete) return
    if (!confirm('Delete this workflow?')) return
    setError(null)
    try { await props.onDelete() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const setStep = (step: WorkflowStep) => {
    const idx = workflow.steps.findIndex((s) => s.name === selectedStep)
    if (idx < 0) return
    // Rename: if step.name changed, update depends_on references
    const oldName = workflow.steps[idx].name
    const newName = step.name
    const nextSteps = workflow.steps.map((s, i) => {
      if (i === idx) return step
      if (oldName !== newName) {
        return { ...s, depends_on: (s.depends_on ?? []).map((d) => d === oldName ? newName : d) }
      }
      return s
    })
    onChange({ ...workflow, steps: nextSteps })
    if (oldName !== newName) setSelectedStep(newName)
  }

  const deleteStep = () => {
    if (!selectedStep) return
    const name = selectedStep
    onChange({
      ...workflow,
      steps: workflow.steps
        .filter((s) => s.name !== name)
        .map((s) => ({ ...s, depends_on: (s.depends_on ?? []).filter((d) => d !== name) })),
    })
    setSelectedStep(null)
  }

  const addStep = (action: ActionType) => {
    let base = action.replace(/_/g, ' ')
    let candidate = base
    let i = 1
    while (workflow.steps.find((s) => s.name === candidate)) {
      candidate = `${base} ${++i}`
    }
    const step: WorkflowStep = {
      name: candidate,
      action,
      action_data: defaultActionData(action),
      inputs: {},
      outputs: {},
      depends_on: [],
    }
    onChange({ ...workflow, steps: [...workflow.steps, step] })
    setSelectedStep(candidate)
  }

  const addDependency = (childName: string, parentName: string) => {
    onChange({
      ...workflow,
      steps: workflow.steps.map((s) => {
        if (s.name !== childName) return s
        const cur = s.depends_on ?? []
        if (cur.includes(parentName)) return s
        return { ...s, depends_on: [...cur, parentName] }
      }),
    })
  }

  const removeDependency = (childName: string, parentName: string) => {
    onChange({
      ...workflow,
      steps: workflow.steps.map((s) =>
        s.name !== childName
          ? s
          : { ...s, depends_on: (s.depends_on ?? []).filter((d) => d !== parentName) },
      ),
    })
  }

  const currentStep = workflow.steps.find((s) => s.name === selectedStep) ?? null

  return (
    <div className={styles.right}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <input
            className={styles.wfTitleInput}
            value={workflow.name}
            onChange={(e) => onChange({ ...workflow, name: e.target.value })}
            placeholder="workflow name"
          />
          <span className={styles.wfSub}>
            {workflow.steps.length} steps · {workflow.trigger}
            {props.isDirty && <span style={{ color: 'var(--status-warn-text)' }}> · unsaved</span>}
          </span>
        </div>
        <div className={styles.toolbarRight}>
          {props.eventgroupId != null && props.onRun && (
            <button className={`${styles.btn} ${styles.btnSuccess}`} onClick={handleRun} disabled={props.isRunning}>
              {props.isRunning ? 'running…' : '▶ run'}
            </button>
          )}
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={props.isSaving || validation.length > 0}>
            {props.isSaving ? 'saving…' : (props.eventgroupId == null ? 'create' : 'save')}
          </button>
          {props.eventgroupId != null && props.onDelete && (
            <button className={styles.dangerBtn} onClick={handleDelete}>delete</button>
          )}
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'definition' ? styles.tabActive : ''}`} onClick={() => setTab('definition')}>
          Definition
        </button>
        <button className={`${styles.tab} ${tab === 'yaml' ? styles.tabActive : ''}`} onClick={() => { setYamlText(workflowToYaml(workflow)); setTab('yaml') }}>
          YAML
        </button>
        <button
          className={`${styles.tab} ${tab === 'instances' ? styles.tabActive : ''}`}
          onClick={() => setTab('instances')}
          disabled={props.eventgroupId == null}
          style={props.eventgroupId == null ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          Instances
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {validation.length > 0 && (
        <div className={styles.validList}>
          {validation.map((v, i) => <div key={i} className={styles.validItem}>⚠ {v}</div>)}
        </div>
      )}

      {tab === 'definition' && (
        <>
          <div className={styles.metaForm}>
            <div className={styles.metaField}>
              <label className={styles.metaLabel}>Trigger</label>
              <select className={styles.metaSelect} value={workflow.trigger}
                onChange={(e) => onChange({ ...workflow, trigger: e.target.value as Workflow['trigger'] })}>
                {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.metaField}>
              <label className={styles.metaLabel}>Run As</label>
              <select className={styles.metaSelect} value={workflow.run_as ?? 'self'}
                onChange={(e) => onChange({ ...workflow, run_as: e.target.value })}>
                {RUN_AS_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className={styles.metaField} style={{ flex: 1, minWidth: 200 }}>
              <label className={styles.metaLabel}>Description</label>
              <input className={styles.metaInput} value={workflow.description ?? ''}
                onChange={(e) => onChange({ ...workflow, description: e.target.value })}
                style={{ width: '100%' }} />
            </div>
            {workflow.trigger === 'keyword' && (
              <div className={styles.metaField} style={{ minWidth: 200 }}>
                <label className={styles.metaLabel}>Keywords (comma-sep)</label>
                <input className={styles.metaInput}
                  value={(workflow.keywords ?? []).join(',')}
                  onChange={(e) => onChange({ ...workflow, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
            )}
            {workflow.trigger === 'cron' && (
              <div className={styles.metaField} style={{ minWidth: 160 }}>
                <label className={styles.metaLabel}>Cron Expression</label>
                <input className={styles.metaInput}
                  value={String((workflow.trigger_data ?? {}).cron ?? '')}
                  onChange={(e) => onChange({ ...workflow, trigger_data: { ...(workflow.trigger_data ?? {}), cron: e.target.value } })}
                  placeholder="0 2 * * *" />
              </div>
            )}
          </div>

          <div className={styles.tabContent}>
            <div className={styles.palette}>
              <div className={styles.paletteTitle}>+ ADD STEP</div>
              <div className={styles.paletteBody}>
                {ACTIONS.map((a) => (
                  <button key={a} className={styles.paletteItem} onClick={() => addStep(a)}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.dagWrap}>
              <DagView
                steps={workflow.steps}
                selectedName={selectedStep}
                onSelect={setSelectedStep}
                editable
                onDependencyAdd={addDependency}
                onDependencyRemove={removeDependency}
              />
            </div>
            {currentStep && (
              <StepInspector
                step={currentStep}
                allStepNames={workflow.steps.map((s) => s.name)}
                onChange={setStep}
                onDelete={deleteStep}
              />
            )}
          </div>
        </>
      )}

      {tab === 'yaml' && (
        <div className={styles.yamlWrap}>
          {yamlError && <div className={styles.error}>YAML parse error: {yamlError}</div>}
          <textarea
            className={styles.yamlTextarea}
            value={yamlText}
            onChange={(e) => handleYamlChange(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {tab === 'instances' && props.eventgroupId != null && (
        <InstanceView eventgroupId={props.eventgroupId} steps={workflow.steps} />
      )}
    </div>
  )
}
