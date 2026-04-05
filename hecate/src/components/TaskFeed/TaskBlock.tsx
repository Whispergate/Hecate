/* ═══════════════════════════════════════════════════
   hecate/src/components/TaskFeed/TaskBlock.tsx
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect, useState, useCallback } from 'react'
import type { Task }                                  from '@/store'
import styles                                          from './TaskFeed.module.css'

interface Props { task: Task }

// ── Helpers ───────────────────────────────────────────

function decodeOutput(raw: string): string {
  try { return atob(raw) } catch { return raw }
}

function formatTimestamp(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  if (sameDay) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function statusMod(status: string): string {
  if (status === 'completed') return styles.statusDone
  if (status === 'error')     return styles.statusErr
  if (status === 'submitted') return styles.statusQueued
  return styles.statusRunning
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'done'
  if (status === 'error')     return 'error'
  if (status === 'submitted') return 'queued'
  return 'running'
}

// ── Component ─────────────────────────────────────────

export function TaskBlock({ task }: Props) {
  const outputRef          = useRef<HTMLPreElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied]       = useState(false)

  const fullOutput = task.responses.map((r) => decodeOutput(r.response)).join('')
  const isRunning  = task.status !== 'completed' && task.status !== 'error'
  const hasOutput  = fullOutput.length > 0

  // Auto-scroll output to bottom as chunks arrive (unless user has scrolled up)
  useEffect(() => {
    if (!collapsed && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [fullOutput, collapsed])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fullOutput).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [fullOutput])

  const blockClass = [
    styles.taskBlock,
    statusMod(task.status),
    isRunning ? styles.blockRunning : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={blockClass}>

      {/* ── Prompt line (click to collapse) ── */}
      <button
        className={styles.taskPrompt}
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand output' : 'Collapse output'}
      >
        <span className={styles.promptCaret}>{collapsed ? '▶' : '▼'}</span>

        <span className={styles.promptOp}>
          [{task.operator?.username ?? 'op'}@{task.callback.host}]
        </span>

        <span className={styles.promptDollar}>$</span>

        <span className={styles.promptCmd}>{task.command_name}</span>

        {task.params && (
          <span className={styles.promptParams}>{task.params}</span>
        )}

        <span className={styles.promptSpacer} />

        {/* Status pill */}
        <span className={`${styles.statusPill} ${statusMod(task.status)}`}>
          {isRunning && <span className={styles.statusDot} />}
          {statusLabel(task.status)}
        </span>

        {/* Task id + time */}
        <span className={styles.taskMeta}>
          #{task.display_id} · {formatTimestamp(task.timestamp)}
        </span>
      </button>

      {/* ── Output area ── */}
      {!collapsed && (
        <div className={styles.outputWrap}>
          {hasOutput ? (
            <>
              <div className={styles.outputToolbar}>
                <span className={styles.outputLabel}>output</span>
                <button
                  className={styles.copyBtn}
                  onClick={(e) => { e.stopPropagation(); handleCopy() }}
                  title="Copy output"
                >
                  {copied ? 'copied ✓' : 'copy'}
                </button>
              </div>
              <pre ref={outputRef} className={styles.outputPre}>
                {fullOutput}
              </pre>
            </>
          ) : isRunning ? (
            <div className={styles.waitingRow}>
              <span className={styles.waitDot} />
              <span className={styles.waitDot} />
              <span className={styles.waitDot} />
              <span className={styles.waitText}>waiting for agent response</span>
            </div>
          ) : (
            <div className={styles.noOutput}>(no output)</div>
          )}
        </div>
      )}
    </div>
  )
}
