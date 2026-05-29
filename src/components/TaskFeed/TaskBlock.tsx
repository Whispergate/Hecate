/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/TaskBlock.tsx
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect, useState, useCallback, memo } from 'react'
import { useSubscription }                                  from '@apollo/client'
import { SUB_TASK_RESPONSES }                               from '@/apollo/operations'
import type { Task }                                        from '@/store'
import { FileBrowser, parseLsOutput }                       from './FileBrowser'
import { ProcessBrowser, parsePsOutput }                    from './ProcessBrowser'
import { InjectionBrowser, parseInjectionTechniques }       from './InjectionBrowser'
import { BrowserTable, parseConcatRows }                     from './BrowserTable'
import { BROWSER_TABLE_CONFIGS }                             from './browserTableConfigs'
import { ScreenshotView, parseScreenshotIds }                from './ScreenshotView'
import styles                                               from './TaskFeed.module.css'

interface Props { task: Task }

// ── Helpers ───────────────────────────────────────────

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

function formatTimestamp(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()

  const time = d.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

function statusMod(status: string, completed: boolean): string {
  if (completed || status === 'completed' || status === 'success') return styles.statusDone
  if (status.toLowerCase().includes('error'))                      return styles.statusErr
  if (status === 'submitted')                                      return styles.statusQueued
  return styles.statusRunning
}

function statusLabel(status: string, completed: boolean): string {
  if (completed || status === 'completed' || status === 'success') return 'done'
  if (status.toLowerCase().includes('error'))                      return 'error'
  if (status === 'submitted')                                      return 'queued'
  if (status.toLowerCase().includes('processing'))                 return 'processing'
  return status
}

// ── TaskBlock ─────────────────────────────────────────
// Subscription state lives HERE — not in a child — so it survives collapse/expand.
// Subscription is lazy-started: running tasks subscribe immediately; completed
// tasks only subscribe on first expand (avoids N simultaneous subs on load).

function taskPropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.task.id             === next.task.id             &&
    prev.task.status         === next.task.status         &&
    prev.task.completed      === next.task.completed      &&
    prev.task.response_count === next.task.response_count &&
    prev.task.display_params === next.task.display_params
  )
}

export const TaskBlock = memo(function TaskBlock({ task }: Props) {
  const outputRef                 = useRef<HTMLPreElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [lines,     setLines]     = useState<Array<{ id: number; response: string }>>([])

  // Only completed tasks with output need lazy-start; running tasks start immediately
  const isRunning = !task.completed && !task.status.toLowerCase().includes('error')
  const hasOutput = task.response_count > 0
  const [subStarted, setSubStarted] = useState(isRunning)

  // Kick off subscription when first expanded (for completed tasks)
  const handleToggle = useCallback(() => {
    setCollapsed(c => {
      if (c) setSubStarted(true) // expanding → start sub if not already
      return !c
    })
  }, [])

  // Subscription at this level — never unmounts on collapse
  useSubscription(SUB_TASK_RESPONSES, {
    variables: { task_id: task.id },
    skip: !hasOutput || !subStarted,
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

  // Auto-scroll to bottom when new output arrives (only when visible)
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

  const blockMod    = statusMod(task.status, task.completed)
  const displayArgs = (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''

  // What to show in the output area
  const showOutput  = !collapsed && fullOutput
  const showWaiting = !collapsed && !fullOutput && isRunning
  const showHint    = collapsed && (hasOutput || lines.length > 0)

  return (
    <div className={`${styles.taskBlock} ${blockMod} ${isRunning ? styles.blockRunning : ''}`}>

      {/* ── Prompt line ── */}
      <button
        className={styles.taskPrompt}
        onClick={handleToggle}
        aria-expanded={!collapsed}
      >
        <span className={styles.promptCaret}>{collapsed ? '▶' : '▼'}</span>

        <span className={styles.promptOp}>
          [{task.operator?.username ?? 'op'}@{task.callback.host}]
        </span>

        <span className={styles.promptDollar}>$</span>
        <span className={styles.promptCmd}>{task.command_name}</span>

        {displayArgs && (
          <span className={styles.promptParams}>{displayArgs}</span>
        )}

        {task.tags?.map((tag, i) => (
          <span
            key={i}
            className={styles.tag}
            style={{ '--tag-color': tag.tagtype.color } as React.CSSProperties}
          >
            {tag.tagtype.name}
          </span>
        ))}

        <span className={styles.promptSpacer} />

        <span className={`${styles.statusPill} ${blockMod}`}>
          {isRunning && <span className={styles.statusDot} />}
          {statusLabel(task.status, task.completed)}
        </span>

        <span className={styles.taskMeta}>
          #{task.display_id} · {formatTimestamp(task.timestamp)}
        </span>
      </button>

      {/* ── Output (hidden when collapsed, but parent state persists) ── */}
      {showOutput && (
        <div className={styles.outputWrap}>
          <div className={styles.outputToolbar}>
            <span className={styles.outputLabel}>output</span>
            <button
              className={styles.copyBtn}
              onClick={(e) => { e.stopPropagation(); handleCopy() }}
            >
              {copied ? 'copied ✓' : 'copy'}
            </button>
          </div>
          {(() => {
            const lsResult = parseLsOutput(fullOutput)
            if (lsResult) return <FileBrowser result={lsResult} callbackDisplayId={task.callback.display_id} />
            const psResult = parsePsOutput(fullOutput)
            if (psResult) return <ProcessBrowser processes={psResult} callbackDisplayId={task.callback.display_id} />
            if (task.command_name === 'get_injection_techniques') {
              const injResult = parseInjectionTechniques(fullOutput)
              if (injResult) return <InjectionBrowser techniques={injResult} callbackDisplayId={task.callback.display_id} />
            }
            const tableCfg = BROWSER_TABLE_CONFIGS[task.command_name]
            if (tableCfg) {
              const rows = parseConcatRows(fullOutput)
              if (rows) return <BrowserTable config={tableCfg} rows={rows} callbackDisplayId={task.callback.display_id} />
            }
            if (task.command_name === 'screenshot') {
              const shots = parseScreenshotIds(fullOutput)
              if (shots) return <ScreenshotView fileIds={shots} />
            }
            return <pre ref={outputRef} className={styles.outputPre}>{fullOutput}</pre>
          })()}
        </div>
      )}

      {/* ── Waiting dots (running, no output yet) ── */}
      {showWaiting && (
        <div className={styles.waitingRow}>
          <span className={styles.waitDot} />
          <span className={styles.waitDot} />
          <span className={styles.waitDot} />
          <span className={styles.waitText}>waiting for agent response</span>
        </div>
      )}

      {/* ── Collapsed hint ── */}
      {showHint && (
        <button className={styles.collapsedHint} onClick={() => setCollapsed(false)}>
          ▶ {lines.length > 0 ? lines.length : task.response_count} chunk{(lines.length || task.response_count) !== 1 ? 's' : ''} — click to expand
        </button>
      )}
    </div>
  )
}, taskPropsEqual)
