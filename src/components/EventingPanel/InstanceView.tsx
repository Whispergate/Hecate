/* ═══════════════════════════════════════════════════
   src/components/EventingPanel/InstanceView.tsx

   Instances tab: list of past executions on the left,
   selected execution's DAG with live step status on the
   right. Streams eventstepinstance updates.
   ═══════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useSubscription } from '@apollo/client'
import {
  EVENTING_TRIGGER_CANCEL,
  GET_EVENT_GROUP_INSTANCES,
  SUB_EVENT_STEP_INSTANCES,
} from '@/apollo/operations'
import { parseTs } from '@/components/Sidebar/utils'
import { DagView } from './DagView'
import { statusColor, type WorkflowStep } from './eventingTypes'
import styles from './EventingPanel.module.css'

interface InstanceRow {
  id: number
  status: string
  trigger: string
  current_order_step: number
  total_order_steps: number
  created_at: string
  end_timestamp: string | null
  operator: { username: string } | null
}

interface StepInstanceRow {
  id: number
  status: string
  order: number
  stdout: string | null
  stderr: string | null
  inputs: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  action_data: Record<string, unknown> | null
  updated_at: string
  end_timestamp: string | null
  eventstep: { id: number; name: string; action: string; order: number; depends_on: string[] | null } | null
}

export function InstanceView({ eventgroupId, steps }: { eventgroupId: number; steps: WorkflowStep[] }) {
  const { data, refetch } = useQuery<{ eventgroupinstance: InstanceRow[] }>(
    GET_EVENT_GROUP_INSTANCES,
    { variables: { eventgroup_id: eventgroupId }, fetchPolicy: 'cache-and-network' },
  )
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null)
  const [cancel] = useMutation(EVENTING_TRIGGER_CANCEL)

  const instances = data?.eventgroupinstance ?? []

  // Auto-select most recent
  const currentId = selectedInstanceId ?? instances[0]?.id ?? null

  const handleCancel = async (id: number) => {
    try {
      await cancel({ variables: { eventgroupinstance_id: id } })
      await refetch()
    } catch (e) { /* surfaced via Apollo error */ }
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div className={styles.instList} style={{ maxWidth: 360, borderRight: '1px solid var(--beige-border)' }}>
        <div className={`${styles.instRow} ${styles.instHeader}`}>
          <div>ID</div>
          <div>STATUS</div>
          <div>TRIGGER</div>
          <div>STARTED</div>
          <div>DURATION</div>
        </div>
        <div className={styles.instTable}>
          {instances.length === 0 && (
            <div style={{ padding: 20, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--bone-700)' }}>
              No instances yet — run the workflow to see executions here.
            </div>
          )}
          {instances.map((inst) => {
            const isActive = inst.id === currentId
            return (
              <div
                key={inst.id}
                className={`${styles.instRow} ${isActive ? styles.instRowActive : ''}`}
                onClick={() => setSelectedInstanceId(inst.id)}
              >
                <div>#{inst.id}</div>
                <div>
                  <span className={styles.statusBadge} style={{ color: statusColor(inst.status) }}>
                    {inst.status}
                  </span>
                </div>
                <div style={{ color: 'var(--bone-600)', fontSize: 10 }}>{inst.trigger}</div>
                <div style={{ color: 'var(--bone-600)', fontSize: 10 }}>
                  {formatRelative(inst.created_at)}
                </div>
                <div style={{ color: 'var(--bone-700)', fontSize: 10 }}>
                  {formatDuration(inst.created_at, inst.end_timestamp)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {currentId != null && (
        <InstanceDetail
          instanceId={currentId}
          steps={steps}
          onCancel={() => handleCancel(currentId)}
          status={instances.find((i) => i.id === currentId)?.status ?? null}
        />
      )}
    </div>
  )
}

function InstanceDetail({
  instanceId,
  steps,
  onCancel,
  status,
}: {
  instanceId: number
  steps: WorkflowStep[]
  onCancel: () => void
  status: string | null
}) {
  const { data } = useSubscription<{ eventstepinstance_stream: StepInstanceRow[] }>(
    SUB_EVENT_STEP_INSTANCES,
    { variables: { eventgroupinstance_id: instanceId } },
  )

  // Build status map per step name, merging stream updates over time
  const [acc, setAcc] = useState<Record<number, StepInstanceRow>>({})
  const updates = data?.eventstepinstance_stream
  useEffect(() => {
    if (!updates) return
    setAcc((prev) => {
      const next = { ...prev }
      for (const u of updates) next[u.id] = u
      return next
    })
  }, [updates])

  // When instance changes, reset accumulator
  useEffect(() => { setAcc({}) }, [instanceId])

  const statusMap: Record<string, string> = {}
  for (const row of Object.values(acc)) {
    if (row.eventstep?.name) statusMap[row.eventstep.name] = row.status
  }

  const [selectedStep, setSelectedStep] = useState<string | null>(null)
  const selectedStepRow = selectedStep
    ? Object.values(acc).find((r) => r.eventstep?.name === selectedStep) ?? null
    : null

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div className={styles.dagWrap}>
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 5,
          display: 'flex', gap: 6,
        }}>
          {status === 'running' && (
            <button className={styles.dangerBtn} onClick={onCancel}>cancel</button>
          )}
        </div>
        <DagView
          steps={steps}
          statusMap={statusMap}
          selectedName={selectedStep}
          onSelect={setSelectedStep}
        />
      </div>
      {selectedStepRow && (
        <div className={styles.stepInspector}>
          <div className={styles.inspectorHeader}>
            <span className={styles.inspectorTitle}>{selectedStepRow.eventstep?.name}</span>
            <span style={{ color: statusColor(selectedStepRow.status), fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              {selectedStepRow.status}
            </span>
          </div>
          <div className={styles.inspectorBody}>
            {selectedStepRow.stdout && (
              <div className={styles.inspField}>
                <label className={styles.inspLabel}>stdout</label>
                <pre style={{
                  background: 'var(--bg-void)', padding: 8, color: 'var(--bone-300)',
                  fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
                  border: '1px solid var(--beige-border)', borderRadius: 2,
                }}>{selectedStepRow.stdout}</pre>
              </div>
            )}
            {selectedStepRow.stderr && (
              <div className={styles.inspField}>
                <label className={styles.inspLabel}>stderr</label>
                <pre style={{
                  background: 'var(--bg-void)', padding: 8, color: 'var(--status-err-text)',
                  fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
                  border: '1px solid var(--crimson-700)', borderRadius: 2,
                }}>{selectedStepRow.stderr}</pre>
              </div>
            )}
            {selectedStepRow.outputs && Object.keys(selectedStepRow.outputs).length > 0 && (
              <div className={styles.inspField}>
                <label className={styles.inspLabel}>outputs</label>
                <pre style={{
                  background: 'var(--bg-raised)', padding: 8, color: 'var(--bone-300)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
                  border: '1px solid var(--beige-border)', borderRadius: 2,
                }}>{JSON.stringify(selectedStepRow.outputs, null, 2)}</pre>
              </div>
            )}
            {selectedStepRow.inputs && Object.keys(selectedStepRow.inputs).length > 0 && (
              <div className={styles.inspField}>
                <label className={styles.inspLabel}>inputs</label>
                <pre style={{
                  background: 'var(--bg-raised)', padding: 8, color: 'var(--bone-300)',
                  fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap',
                  border: '1px solid var(--beige-border)', borderRadius: 2,
                }}>{JSON.stringify(selectedStepRow.inputs, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatRelative(ts: string): string {
  const t = parseTs(ts).getTime()
  if (!t) return '—'
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return 'running'
  const s = parseTs(start).getTime()
  const e = parseTs(end).getTime()
  if (!s || !e) return '—'
  const diff = (e - s) / 1000
  if (diff < 1) return `${Math.floor(diff * 1000)}ms`
  if (diff < 60) return `${diff.toFixed(1)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${Math.floor(diff % 60)}s`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
}
