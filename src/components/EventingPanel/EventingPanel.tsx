/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/EventingPanel.tsx

   Top-level shell: workflow list (left) + editor (right).
   Owns selected workflow state, fetches detail on selection,
   handles save (upload) / run / delete.
   ═══════════════════════════════════════════════════ */

import { useState } from 'react'
import { useLazyQuery, useMutation, useQuery } from '@apollo/client'
import {
  EVENTING_TRIGGER_MANUAL,
  EVENTING_TRIGGER_UPDATE,
  GET_EVENT_GROUPS,
  GET_EVENT_GROUP_DETAIL,
} from '@/apollo/operations'
import { useStore } from '@/store'
import { WorkflowEditor } from './WorkflowEditor'
import { emptyWorkflow, type Workflow, type WorkflowStep } from './eventingTypes'
import styles from './EventingPanel.module.css'

interface EventGroup {
  id: number
  name: string
  description: string | null
  trigger: string
  trigger_data: Record<string, unknown> | null
  keywords: string[] | null
  environment: Record<string, unknown> | null
  active: boolean
  approved_to_run: boolean
  run_as: string | null
  total_steps: number
  created_at: string
  operator: { username: string } | null
}

interface EventGroupDetail extends EventGroup {
  eventsteps: Array<{
    id: number
    name: string
    description: string | null
    action: string
    action_data: Record<string, unknown> | null
    inputs: Record<string, unknown> | null
    outputs: Record<string, unknown> | null
    environment: Record<string, unknown> | null
    depends_on: string[] | null
    order: number
    continue_on_error: boolean
  }>
}

type Mode =
  | { kind: 'none' }
  | { kind: 'draft'; workflow: Workflow; dirty: boolean }
  | { kind: 'existing'; eventgroupId: number; workflow: Workflow; original: Workflow; dirty: boolean }

export function EventingPanel() {
  const token = useStore((s) => s.token)
  const { data, refetch } = useQuery<{ eventgroup: EventGroup[] }>(GET_EVENT_GROUPS, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 10_000,
  })
  const [fetchDetail] = useLazyQuery<{ eventgroup_by_pk: EventGroupDetail | null }>(
    GET_EVENT_GROUP_DETAIL,
  )
  const [runManual] = useMutation(EVENTING_TRIGGER_MANUAL)
  const [updateGroup] = useMutation(EVENTING_TRIGGER_UPDATE)

  const [mode, setMode] = useState<Mode>({ kind: 'none' })
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const groups = data?.eventgroup ?? []

  const selectExisting = async (id: number) => {
    if (mode.kind !== 'none' && (mode as Exclude<Mode, { kind: 'none' }>).dirty) {
      if (!confirm('Discard unsaved changes?')) return
    }
    setGlobalError(null)
    const res = await fetchDetail({ variables: { id }, fetchPolicy: 'network-only' })
    const detail = res.data?.eventgroup_by_pk
    if (!detail) {
      setGlobalError('Failed to load workflow')
      return
    }
    const workflow = detailToWorkflow(detail)
    setMode({ kind: 'existing', eventgroupId: id, workflow, original: workflow, dirty: false })
  }

  const startNew = () => {
    if (mode.kind !== 'none' && (mode as Exclude<Mode, { kind: 'none' }>).dirty) {
      if (!confirm('Discard unsaved changes?')) return
    }
    setGlobalError(null)
    setMode({ kind: 'draft', workflow: emptyWorkflow('new workflow'), dirty: true })
  }

  const handleChange = (next: Workflow) => {
    if (mode.kind === 'draft') {
      setMode({ ...mode, workflow: next, dirty: true })
    } else if (mode.kind === 'existing') {
      setMode({ ...mode, workflow: next, dirty: true })
    }
  }

  const handleSave = async (yamlText: string) => {
    if (mode.kind === 'none') return
    setIsSaving(true)
    setGlobalError(null)
    try {
      if (mode.kind === 'existing') {
        // Update existing workflow via Hasura action
        const res = await updateGroup({
          variables: {
            eventgroup_id: mode.eventgroupId,
            updated_config: yamlText,
          },
        })
        const r = res.data?.eventingTriggerUpdate
        if (r?.status !== 'success') throw new Error(r?.error || 'Update failed')
        await refetch()
        setMode({ ...mode, original: mode.workflow, dirty: false })
      } else {
        // Create new workflow via REST: POST /api/v1.4/eventing_import_webhook (multipart form)
        const form = new FormData()
        const blob = new Blob([yamlText], { type: 'application/x-yaml' })
        form.append('file', blob, `${mode.workflow.name.replace(/\s+/g, '_')}.yaml`)
        form.append('comment', 'Uploaded from Hecate')

        const resp = await fetch('/api/v1.4/eventing_import_webhook', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            MythicSource: 'web',
          },
          body: form,
        })
        const json = await resp.json()
        if (json.status !== 'success') throw new Error(json.error || 'Import failed')
        await refetch()
        // Switch to the just-created workflow
        await selectExisting(json.eventgroup_id)
      }
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setIsSaving(false)
    }
  }

  const handleRun = async () => {
    if (mode.kind !== 'existing') return
    setIsRunning(true)
    setGlobalError(null)
    try {
      const res = await runManual({ variables: { eventgroup_id: mode.eventgroupId, env_data: {} } })
      const r = res.data?.eventingTriggerManual
      if (r?.status !== 'success') throw new Error(r?.error || 'Trigger failed')
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsRunning(false)
    }
  }

  const handleDelete = async () => {
    if (mode.kind !== 'existing') return
    setGlobalError(null)
    try {
      const res = await updateGroup({
        variables: { eventgroup_id: mode.eventgroupId, deleted: true },
      })
      const r = res.data?.eventingTriggerUpdate
      if (r?.status !== 'success') throw new Error(r?.error || 'Delete failed')
      await refetch()
      setMode({ kind: 'none' })
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e))
    }
  }

  // Reset to 'none' if active operation changes (handled by Apollo cache clear in store)
  // Nothing to do here — components remount on op switch.

  const selectedId = mode.kind === 'existing' ? mode.eventgroupId : null

  return (
    <div className={styles.panel}>
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>WORKFLOWS</span>
          <button className={styles.newBtn} onClick={startNew}>+ NEW</button>
        </div>
        {globalError && <div className={styles.error}>{globalError}</div>}
        <div className={styles.listScroll}>
          {mode.kind === 'draft' && (
            <div className={`${styles.listItem} ${styles.listItemActive}`}>
              <div className={styles.itemName}>{mode.workflow.name}</div>
              <div className={styles.itemMeta}>
                <span className={styles.itemTrigger}>draft · {mode.workflow.trigger}</span>
              </div>
            </div>
          )}
          {groups.map((g) => (
            <WorkflowListItem
              key={g.id}
              group={g}
              active={g.id === selectedId}
              onClick={() => selectExisting(g.id)}
            />
          ))}
          {groups.length === 0 && mode.kind !== 'draft' && (
            <div style={{ padding: 16, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--bone-700)' }}>
              No workflows yet. Click + NEW to create one.
            </div>
          )}
        </div>
      </div>

      {mode.kind === 'none' ? (
        <div className={styles.empty}>
          Select a workflow on the left, or click + NEW to create one.
        </div>
      ) : (
        <WorkflowEditor
          workflow={mode.workflow}
          onChange={handleChange}
          onSave={handleSave}
          onRun={mode.kind === 'existing' ? handleRun : undefined}
          onDelete={mode.kind === 'existing' ? handleDelete : undefined}
          eventgroupId={mode.kind === 'existing' ? mode.eventgroupId : null}
          isSaving={isSaving}
          isRunning={isRunning}
          isDirty={mode.dirty}
        />
      )}
    </div>
  )
}

function WorkflowListItem({
  group,
  active,
  onClick,
}: {
  group: EventGroup
  active: boolean
  onClick: () => void
}) {
  return (
    <div className={`${styles.listItem} ${active ? styles.listItemActive : ''}`} onClick={onClick}>
      <div className={styles.itemName}>{group.name}</div>
      <div className={styles.itemMeta}>
        <span
          className={`${styles.itemDot} ${group.active ? styles.itemDotActive : group.approved_to_run ? styles.itemDotPending : ''}`}
          title={group.active ? 'active' : 'inactive'}
        />
        <span className={styles.itemTrigger}>{group.trigger}</span>
        <span>·</span>
        <span>{group.total_steps} step{group.total_steps === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}

function detailToWorkflow(detail: EventGroupDetail): Workflow {
  const steps: WorkflowStep[] = detail.eventsteps.map((s) => ({
    name: s.name,
    description: s.description ?? '',
    action: s.action as WorkflowStep['action'],
    action_data: s.action_data ?? {},
    inputs: s.inputs ?? {},
    outputs: s.outputs ?? {},
    environment: s.environment ?? {},
    depends_on: s.depends_on ?? [],
    continue_on_error: s.continue_on_error,
  }))
  return {
    name: detail.name,
    description: detail.description ?? '',
    trigger: detail.trigger as Workflow['trigger'],
    trigger_data: detail.trigger_data ?? {},
    run_as: detail.run_as ?? 'self',
    keywords: detail.keywords ?? [],
    environment: detail.environment ?? {},
    steps,
  }
}

