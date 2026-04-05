/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskBlock.tsx
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect } from 'react'
import type { Task }         from '@/store'
import styles                from './TaskFeed.module.css'

interface Props { task: Task }

function statusBadgeClass(status: string): string {
  if (status === 'completed') return 'badge badge--done'
  if (status === 'error')     return 'badge badge--err'
  return 'badge badge--run'
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Done'
  if (status === 'error')     return 'Error'
  if (status === 'submitted') return 'Queued'
  return 'Running'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false })
}

// Decode base64 output that Mythic returns
function decodeOutput(raw: string): string {
  try { return atob(raw) } catch { return raw }
}

export function TaskBlock({ task }: Props) {
  const outputRef = useRef<HTMLDivElement>(null)

  const fullOutput = task.responses.map((r) => decodeOutput(r.response)).join('')
  const isRunning  = task.status !== 'completed' && task.status !== 'error'

  // Auto-scroll output to bottom as chunks arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullOutput])

  return (
    <div className={`${styles.taskBlock} ${isRunning ? styles.running : ''}`}>

      {/* Header */}
      <div className={styles.taskHeader}>
        <span className={styles.taskId}>#{task.display_id}</span>
        <span className={styles.taskCmd}>{task.command_name} {task.params}</span>
        <span className={styles.taskTime}>{formatTime(task.timestamp)}</span>
        <span className={statusBadgeClass(task.status)}>
          {statusLabel(task.status)}
        </span>
      </div>

      {/* Output */}
      {fullOutput && (
        <div ref={outputRef} className={styles.taskOutput}>
          <pre>{fullOutput}</pre>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && !fullOutput && (
        <div className={styles.taskRunning}>
          <span className={styles.spinner} />
          waiting for response…
        </div>
      )}
    </div>
  )
}
