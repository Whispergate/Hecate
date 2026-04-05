/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/TaskOutputPanel.tsx
   Right-pane output viewer for selected task.
   One subscription, full height, no max-height cap.
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect, useState, useCallback } from 'react'
import { useSubscription }                           from '@apollo/client'
import { SUB_TASK_RESPONSES }                        from '@/apollo/operations'
import type { Task }                                 from '@/store'
import { FileBrowser, parseLsOutput }                from './FileBrowser'
import styles                                        from './TaskOutputPanel.module.css'

function decodeResponse(raw: string): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(
      atob(raw).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
  } catch {
    try { return atob(raw) } catch { return raw }
  }
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

function statusLabel(task: Task): string {
  if (task.completed || task.status === 'completed' || task.status === 'success') return 'done'
  if (task.status.toLowerCase().includes('error'))  return 'error'
  if (task.status === 'submitted')                  return 'queued'
  if (task.status.toLowerCase().includes('processing')) return 'processing'
  return task.status
}

function statusMod(task: Task): string {
  if (task.completed || task.status === 'completed' || task.status === 'success') return styles.statusDone
  if (task.status.toLowerCase().includes('error'))  return styles.statusErr
  if (task.status === 'submitted')                  return styles.statusQueued
  return styles.statusRunning
}

// ── No-task placeholder ───────────────────────────────

function EmptyPanel() {
  return (
    <div className={styles.emptyPanel}>
      <span className={styles.emptyIcon}>⬡</span>
      <span className={styles.emptyText}>select a task to view output</span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────

interface Props { task: Task | null }

export function TaskOutputPanel({ task }: Props) {
  const outputRef              = useRef<HTMLPreElement>(null)
  const [lines, setLines]      = useState<Array<{ id: number; response: string }>>([])
  const [copied, setCopied]    = useState(false)

  const prevTaskId = useRef<number | null>(null)

  // Clear output when selected task changes
  useEffect(() => {
    if (task?.id !== prevTaskId.current) {
      setLines([])
      prevTaskId.current = task?.id ?? null
    }
  }, [task?.id])

  const hasOutput = (task?.response_count ?? 0) > 0
  const isRunning = task
    ? !task.completed && !task.status.toLowerCase().includes('error')
    : false

  useSubscription(SUB_TASK_RESPONSES, {
    variables: { task_id: task?.id ?? 0 },
    skip: !task || !hasOutput,
    onData: ({ data }) => {
      const incoming: Array<{ id: number; response: string }> =
        data.data?.response_stream ?? []
      if (!incoming.length) return
      setLines(prev => {
        const map = new Map(prev.map(r => [r.id, r]))
        incoming.forEach(r => map.set(r.id, r))
        return Array.from(map.values()).sort((a, b) => a.id - b.id)
      })
    },
  })

  const fullOutput = lines.map(r => decodeResponse(r.response)).join('')

  // Auto-scroll as output streams in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullOutput])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullOutput).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [fullOutput])

  if (!task) return <EmptyPanel />

  const sMod        = statusMod(task)
  const displayArgs = (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''

  return (
    <div className={styles.panel}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerPrompt}>
          <span className={styles.promptOp}>[{task.operator?.username ?? 'op'}@{task.callback.host}]</span>
          <span className={styles.promptDollar}>$</span>
          <span className={styles.promptCmd}>{task.command_name}</span>
          {displayArgs && <span className={styles.promptArgs}>{displayArgs}</span>}
        </div>

        <div className={styles.headerRight}>
          {/* Tags */}
          {task.tags?.map((tag, i) => (
            <span
              key={i}
              className={styles.tag}
              style={{ '--tag-color': tag.tagtype.color } as React.CSSProperties}
            >
              {tag.tagtype.name}
            </span>
          ))}

          {/* Status */}
          <span className={`${styles.statusPill} ${sMod}`}>
            {isRunning && <span className={styles.statusDot} />}
            {statusLabel(task)}
          </span>

          {/* Copy — only when there's output */}
          {fullOutput && (
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? 'copied ✓' : 'copy'}
            </button>
          )}
        </div>
      </div>

      {/* ── Meta row ── */}
      <div className={styles.meta}>
        <span>task #{task.display_id}</span>
        <span className={styles.metaSep}>·</span>
        <span>{formatFull(task.timestamp)}</span>
        {task.response_count > 0 && <>
          <span className={styles.metaSep}>·</span>
          <span>{task.response_count} chunk{task.response_count !== 1 ? 's' : ''}</span>
        </>}
      </div>

      {/* ── Output ── */}
      <div className={styles.outputArea}>
        {fullOutput ? (
          (() => {
            const lsResult = parseLsOutput(fullOutput)
            if (lsResult) {
              return (
                <FileBrowser
                  result={lsResult}
                  callbackDisplayId={task.callback.display_id}
                />
              )
            }
            return <pre ref={outputRef} className={styles.outputPre}>{fullOutput}</pre>
          })()
        ) : isRunning ? (
          <div className={styles.waiting}>
            <span className={styles.waitDot} />
            <span className={styles.waitDot} />
            <span className={styles.waitDot} />
            <span className={styles.waitText}>waiting for agent response</span>
          </div>
        ) : (
          <div className={styles.noOutput}>(no output)</div>
        )}
      </div>
    </div>
  )
}
