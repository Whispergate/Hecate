/* ═══════════════════════════════════════════════════
   src/components/TaskFeed/ConsoleView.tsx

   Terminal-style unified view: all tasks + output
   in one scrolling pane, oldest → newest.
   ═══════════════════════════════════════════════════ */

import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { useSubscription }             from '@apollo/client'
import { SUB_TASK_RESPONSES }          from '@/apollo/operations'
import type { Task }                   from '@/store'
import { FileBrowser, parseLsOutput }  from './FileBrowser'
import { ProcessBrowser, parsePsOutput } from './ProcessBrowser'
import { KillTaskButton }              from './KillTaskButton'
import styles                          from './ConsoleView.module.css'

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
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── Single task entry inside the console ─────────────

interface EntryProps {
  task: Task
  isLast: boolean
  onOutputChange?: (taskId: number, text: string) => void
}

function ConsoleEntry({ task, isLast, onOutputChange }: EntryProps) {
  const [lines,    setLines]    = useState<Array<{ id: number; response: string }>>([])
  const [expanded, setExpanded] = useState(false)
  const hasOutput = task.response_count > 0
  const isRunning = !task.completed && !task.status.toLowerCase().includes('error')

  useSubscription(SUB_TASK_RESPONSES, {
    variables: { task_id: task.id },
    skip: !hasOutput,
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

  useEffect(() => {
    if (fullOutput && onOutputChange) onOutputChange(task.id, fullOutput)
  }, [fullOutput, task.id, onOutputChange])
  const lsResult   = fullOutput ? parseLsOutput(fullOutput) : null
  const psResult   = (!lsResult && fullOutput) ? parsePsOutput(fullOutput) : null

  const displayArgs = (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''

  const isError = task.status.toLowerCase().includes('error')

  return (
    <div className={styles.entry}>
      {/* Prompt line */}
      <div className={styles.promptLine}>
        <span className={styles.ts}>{formatTimestamp(task.timestamp)}</span>
        <span className={styles.op}>[{task.operator?.username ?? 'op'}@{task.callback.host}]</span>
        <span className={styles.dollar}>$</span>
        <span className={styles.cmd}>{task.command_name}</span>
        {displayArgs && <span className={styles.args}>{displayArgs}</span>}
        <span className={styles.taskId}>#{task.display_id}</span>
        {!task.completed && <KillTaskButton task={task} />}
      </div>

      {/* Output */}
      {fullOutput && (
        lsResult ? (
          <div className={styles.lsWrap}>
            <button className={styles.lsToggle} onClick={() => setExpanded(x => !x)}>
              <span className={styles.lsIcon}>📂</span>
              <span className={styles.lsPath}>
                {[lsResult.parent_path, lsResult.name].filter(Boolean).join('').replace(/\\$/, '')}
              </span>
              <span className={styles.lsMeta}>
                {lsResult.files.filter(f => !f.is_file).length}d {lsResult.files.filter(f => f.is_file).length}f
              </span>
              <span className={styles.lsChevron}>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
              <div className={styles.lsBrowserWrap}>
                <FileBrowser result={lsResult} callbackDisplayId={task.callback.display_id} />
              </div>
            )}
          </div>
        ) : psResult ? (
          <div className={styles.lsWrap}>
            <button className={styles.lsToggle} onClick={() => setExpanded(x => !x)}>
              <span className={styles.lsIcon}>⚙</span>
              <span className={styles.lsPath}>process list</span>
              <span className={styles.lsMeta}>{psResult.length} processes</span>
              <span className={styles.lsChevron}>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
              <div className={styles.lsBrowserWrap}>
                <ProcessBrowser processes={psResult} callbackDisplayId={task.callback.display_id} />
              </div>
            )}
          </div>
        ) : (
          <pre className={`${styles.output} ${isError ? styles.outputErr : ''}`}>
            {fullOutput}
          </pre>
        )
      )}

      {/* Running: waiting indicator (only on last/active task) */}
      {isRunning && !fullOutput && isLast && (
        <div className={styles.waiting}>
          <span className={styles.waitDot} />
          <span className={styles.waitDot} />
          <span className={styles.waitDot} />
        </div>
      )}

      {/* Running: inline pulse after output */}
      {isRunning && fullOutput && !lsResult && isLast && (
        <div className={styles.cursor} />
      )}
    </div>
  )
}

// ── ConsoleView ───────────────────────────────────────

interface Props { tasks: Task[] }

export function ConsoleView({ tasks }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [outputCache, setOutputCache] = useState<Record<number, string>>({})

  const handleOutputChange = useCallback((taskId: number, text: string) => {
    setOutputCache(prev => prev[taskId] === text ? prev : { ...prev, [taskId]: text })
  }, [])

  const isFiltered = query.trim().length > 0

  // Instant scroll on mount (opening console view)
  useLayoutEffect(() => {
    if (!isFiltered) bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [])

  // Smooth scroll when new tasks arrive — disabled while searching
  useEffect(() => {
    if (!isFiltered) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tasks.length, isFiltered])

  // Oldest first for terminal feel
  const ordered = [...tasks].reverse()

  const filtered = isFiltered
    ? ordered.filter(t => {
        const q = query.toLowerCase()
        const line = `${t.command_name} ${t.display_params ?? ''} ${t.params ?? ''}`.toLowerCase()
        const out  = (outputCache[t.id] ?? '').toLowerCase()
        return line.includes(q) || out.includes(q)
      })
    : ordered

  return (
    <div className={styles.consoleWrapper}>
      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          placeholder="/ filter tasks + output…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setQuery('')}
          spellCheck={false}
        />
        {isFiltered && (
          <span className={styles.searchCount}>
            {filtered.length} / {tasks.length}
          </span>
        )}
      </div>

      <div className={styles.console}>
        <div className={styles.consoleInner}>
          {tasks.length === 0 ? (
            <div className={styles.empty}>No tasks yet — issue a command below</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>No tasks match "{query}"</div>
          ) : (
            filtered.map((task, i) => (
              <ConsoleEntry
                key={task.id}
                task={task}
                isLast={i === filtered.length - 1}
                onOutputChange={handleOutputChange}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
