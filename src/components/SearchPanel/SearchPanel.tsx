/* ═══════════════════════════════════════════════════
   src/components/SearchPanel/SearchPanel.tsx

   Cross-callback task search modal.
   Toggle: Ctrl/Cmd+Shift+F  (or Cmd+K → "Search Tasks")

   Searches command_name, display_params, params server-side.
   response_text is base64 — output content searched client-side
   after the user expands a result.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react'
import { useQuery, useSubscription }   from '@apollo/client'
import { SEARCH_TASKS, SUB_TASK_RESPONSES } from '@/apollo/operations'
import { taskCmd, useStore }           from '@/store'
import type { Task }                   from '@/store'
import styles                          from './SearchPanel.module.css'

// ── Response decoder (same as TaskOutputPanel) ────────

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

// ── Inline output expansion ───────────────────────────

function TaskOutput({ taskId, responseCount, outputQuery }: {
  taskId: number
  responseCount: number
  outputQuery: string
}) {
  const [lines, setLines] = useState<Array<{ id: number; response: string }>>([])

  useSubscription(SUB_TASK_RESPONSES, {
    variables: { task_id: taskId },
    skip: responseCount === 0,
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

  if (responseCount === 0) return <div className={styles.noOutput}>(no output)</div>
  if (!fullOutput)         return <div className={styles.loadingOutput}>loading…</div>

  if (outputQuery) {
    const q = outputQuery.toLowerCase()
    if (!fullOutput.toLowerCase().includes(q)) {
      return <div className={styles.noOutput}>(output does not contain "{outputQuery}")</div>
    }
    const escaped = outputQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = fullOutput.split(new RegExp(`(${escaped})`, 'gi'))
    return (
      <pre className={styles.outputPre}>
        {parts.map((part, i) =>
          part.toLowerCase() === q
            ? <mark key={i} className={styles.highlight}>{part}</mark>
            : part
        )}
      </pre>
    )
  }

  return <pre className={styles.outputPre}>{fullOutput}</pre>
}

// ── Single search result row ──────────────────────────

function SearchResult({ task, outputQuery, onJump }: {
  task: Task
  outputQuery: string
  onJump: (callbackId: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const displayArgs = (task.display_params && task.display_params !== '{}' && task.display_params !== '')
    ? task.display_params
    : task.params || ''

  const isCompleted = task.completed || task.status === 'completed' || task.status === 'success'
  const isError     = task.status.toLowerCase().includes('error')
  const ts = new Date(task.timestamp).toLocaleString([], {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  return (
    <div className={styles.result}>
      <div
        className={styles.resultRow}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(x => !x)}
      >
        <span className={styles.chevron}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.hostBadge}>{task.callback.host}</span>
        <span className={styles.taskNum}>#{task.display_id}</span>
        <span className={styles.cmd}>{taskCmd(task)}</span>
        {displayArgs && <span className={styles.args}>{displayArgs}</span>}
        <span className={`${styles.statusPill} ${isCompleted ? styles.done : isError ? styles.err : styles.running}`}>
          {isCompleted ? 'done' : isError ? 'error' : task.status}
        </span>
        <span className={styles.ts}>{ts}</span>
        <button
          className={styles.jumpBtn}
          title="Jump to callback"
          onClick={e => { e.stopPropagation(); onJump(task.callback.id) }}
        >
          →
        </button>
      </div>
      {expanded && (
        <div className={styles.outputWrap}>
          <TaskOutput taskId={task.id} responseCount={task.response_count} outputQuery={outputQuery} />
        </div>
      )}
    </div>
  )
}

// ── SearchModal ───────────────────────────────────────

export function SearchModal() {
  const open        = useStore((s) => s.isSearchOpen)
  const setOpen     = useStore((s) => s.setSearchOpen)
  const activeOperation       = useStore((s) => s.activeOperation)
  const setSelectedCallbackId = useStore((s) => s.setSelectedCallbackId)
  const setActiveRailView     = useStore((s) => s.setActiveRailView)

  const [query, setQuery]               = useState('')
  const [outputQuery, setOutputQuery]   = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd+Shift+F toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(!open)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // Focus input on open, reset query on close
  useEffect(() => {
    if (open) {
      setQuery('')
      setDebouncedQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // 350ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim()
      setDebouncedQuery(q)
      setOutputQuery(q.replace(/%/g, ''))
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  const pattern = debouncedQuery ? `%${debouncedQuery}%` : ''

  const { data, loading, error } = useQuery(SEARCH_TASKS, {
    variables: { operation_id: activeOperation?.id ?? 0, pattern, limit: 200 },
    skip: !open || !activeOperation || !pattern,
    fetchPolicy: 'network-only',
  })

  const tasks: Task[] = data?.task ?? []

  function handleJump(callbackId: number) {
    setSelectedCallbackId(callbackId)
    setActiveRailView('callbacks')
    setOpen(false)
  }

  if (!open) return null

  const showResults = !!debouncedQuery && !!activeOperation

  return (
    <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>

        <div className={styles.header}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            ref={inputRef}
            className={styles.searchInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            placeholder="Search commands, params, args… (% as wildcard)"
            spellCheck={false}
            autoComplete="off"
          />
          {showResults && !loading && (
            <span className={styles.count}>
              {tasks.length === 200 ? '200+' : tasks.length}
            </span>
          )}
          {loading && <span className={styles.count}>…</span>}
          <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className={styles.results}>
          {!activeOperation && (
            <div className={styles.empty}>No active operation.</div>
          )}
          {activeOperation && !debouncedQuery && (
            <div className={styles.empty}>Type to search tasks across all callbacks.</div>
          )}
          {showResults && error && (
            <div className={styles.empty}>Query error: {error.message}</div>
          )}
          {showResults && !loading && tasks.length === 0 && (
            <div className={styles.empty}>No tasks match "{debouncedQuery}".</div>
          )}
          {showResults && !loading && tasks.map(task => (
            <SearchResult
              key={task.id}
              task={task}
              outputQuery={outputQuery}
              onJump={handleJump}
            />
          ))}
          {tasks.length === 200 && (
            <div className={styles.limitNote}>Result limit reached — refine your query.</div>
          )}
        </div>

        <div className={styles.footer}>
          <span><kbd>↵</kbd> expand output</span>
          <span><kbd>→</kbd> jump to callback</span>
          <span><kbd>esc</kbd> close</span>
          <span className={styles.footerRight}>searches command · params · args</span>
        </div>
      </div>
    </div>
  )
}
