/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskBlock.tsx

   Matches Mythic's architecture:
   - Task list subscription gives metadata + response_count
   - Each task fetches its own responses via response_stream subscription
   - response field is base64 encoded
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect, useState } from 'react'
import { useSubscription }             from '@apollo/client'
import { SUB_TASK_RESPONSES }          from '@/apollo/operations'
import type { Task }                   from '@/store'
import styles                          from './TaskFeed.module.css'

interface Props { task: Task }

function statusBadgeClass(status: string): string {
  if (status === 'completed' || status === 'success') return 'badge badge--done'
  if (status.toLowerCase().includes('error'))         return 'badge badge--err'
  return 'badge badge--run'
}

function statusLabel(status: string): string {
  if (status === 'completed' || status === 'success') return 'Done'
  if (status.toLowerCase().includes('error'))         return 'Error'
  if (status === 'submitted')                         return 'Queued'
  if (status.toLowerCase().includes('processing'))    return 'Processing'
  return status
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function decodeResponse(raw: string): string {
  if (!raw) return ''
  try { return atob(raw) } catch { return raw }
}

// ── Responses component — has its own subscription per task ──
function TaskResponses({ taskId, hasResponses }: { taskId: number; hasResponses: boolean }) {
  const outputRef = useRef<HTMLDivElement>(null)
  const [responses, setResponses] = useState<Array<{ id: number; response: string }>>([])

  const { error } = useSubscription(SUB_TASK_RESPONSES, {
    variables: { task_id: taskId },
    skip: !hasResponses,
    onData: ({ data }) => {
      const incoming = data.data?.response_stream ?? []
      if (incoming.length === 0) return
      setResponses(prev => {
        // Merge by id, keep sorted
        const map = new Map(prev.map(r => [r.id, r]))
        incoming.forEach((r: { id: number; response: string }) => map.set(r.id, r))
        return Array.from(map.values()).sort((a, b) => a.id - b.id)
      })
    },
  })

  const fullOutput = responses.map(r => decodeResponse(r.response)).join('')

  // Auto-scroll to bottom as output streams in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullOutput])

  if (!hasResponses && responses.length === 0) return null
  if (error) return (
    <div className={styles.taskOutput}>
      <pre style={{ color: 'var(--status-err-text)' }}>
        [Response subscription error: {error.message}]
      </pre>
    </div>
  )
  if (!fullOutput) return null

  return (
    <div ref={outputRef} className={styles.taskOutput}>
      <pre>{fullOutput}</pre>
    </div>
  )
}

// ── Main TaskBlock ────────────────────────────────────
export function TaskBlock({ task }: Props) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = !task.completed && !task.status.toLowerCase().includes('error')
  const hasResponses = task.response_count > 0

  return (
    <div className={`${styles.taskBlock} ${isRunning ? styles.running : ''}`}>

      {/* ── Meta header ── */}
      <div
        className={styles.taskHeader}
        onClick={() => setExpanded(e => !e)}
      >
        <div className={styles.taskMeta}>
          <span className={styles.taskTimestamp}>{formatDateTime(task.timestamp)}</span>
          <span className={styles.taskSep}>/</span>
          <span className={styles.taskIdLabel}>T-{task.display_id}</span>
          <span className={styles.taskSep}>/</span>
          <span className={styles.taskOperator}>{task.operator?.username ?? '—'}</span>
          <span className={styles.taskSep}>/</span>
          <span className={styles.taskCallback}>C-{task.callback?.display_id}</span>
        </div>
        <div className={styles.taskHeaderRight}>
          <span className={statusBadgeClass(task.status)}>{statusLabel(task.status)}</span>
          <span className={styles.expandChevron}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {/* ── Command line ── */}
      <div className={styles.taskCommand}>
        <span className={styles.taskPrompt}>›</span>
        <span className={styles.taskCmd}>{task.command_name}</span>
        {task.display_params && task.display_params !== '{}' && task.display_params !== '' && (
          <span className={styles.taskParams}> {task.display_params}</span>
        )}
      </div>

      {/* ── Output (only when expanded) ── */}
      {expanded && (
        <>
          <TaskResponses taskId={task.id} hasResponses={hasResponses} />
          {isRunning && !hasResponses && (
            <div className={styles.taskRunning}>
              <span className={styles.spinner} />
              waiting for agent response…
            </div>
          )}
        </>
      )}

      {/* ── Collapsed indicator ── */}
      {!expanded && hasResponses && (
        <div className={styles.taskCollapsed}>
          {task.response_count} response chunk{task.response_count !== 1 ? 's' : ''} — click to expand
        </div>
      )}
    </div>
  )
}
