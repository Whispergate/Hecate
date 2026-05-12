/* ═══════════════════════════════════════════════════
   src/components/EventLogPanel/EventLogPanel.tsx

   Real-time operation event feed. Streams all events
   for the active operation, color-coded by level.
   Operators can send team messages via compose bar.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useSubscription, useMutation }            from '@apollo/client'
import {
  GET_EVENT_LOG, SUB_EVENT_LOG,
  INSERT_EVENT, UPDATE_EVENT_RESOLVED, RESOLVE_ALL_WARNINGS,
} from '@/apollo/operations'
import { parseTs } from '@/components/Sidebar/utils'
import styles      from './EventLogPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface EventLog {
  id:        number
  level:     string
  message:   string
  source:    string
  resolved:  boolean
  warning:   boolean
  count:     number
  timestamp: string
  operator:  { username: string } | null
}

// ── Helpers ───────────────────────────────────────────

const LEVELS = ['all', 'unresolved', 'info', 'warning', 'agent', 'auth', 'debug', 'api'] as const

function levelClass(level: string): string {
  switch (level) {
    case 'warning': return styles.lvlWarning
    case 'debug':   return styles.lvlDebug
    case 'agent':   return styles.lvlAgent
    case 'auth':    return styles.lvlAuth
    case 'api':     return styles.lvlApi
    default:        return styles.lvlInfo
  }
}

function fmtTs(iso: string): string {
  return parseTs(iso).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── EventRow ──────────────────────────────────────────

interface RowProps {
  event:     EventLog
  onResolve: (id: number, resolved: boolean) => void
}

function EventRow({ event, onResolve }: RowProps) {
  const rowCls = [
    styles.row,
    event.warning  ? styles.rowWarning  : '',
    event.resolved ? styles.rowResolved : '',
  ].filter(Boolean).join(' ')

  const label = event.operator
    ? `${event.operator.username}: ${event.message}`
    : event.message

  return (
    <div className={rowCls}>
      <span className={styles.ts}>{fmtTs(event.timestamp)}</span>
      <span className={`${styles.levelBadge} ${levelClass(event.level)}`}>[{event.level}]</span>
      <span className={styles.source} title={event.source}>{event.source || '—'}</span>
      <span className={`${styles.message} ${event.warning && !event.resolved ? styles.messageWarning : ''}`}>
        {label}
      </span>
      <div className={styles.rowMeta}>
        {event.count > 1 && (
          <span className={styles.countBadge}>×{event.count}</span>
        )}
        {(event.warning || event.resolved) && (
          <button
            className={`${styles.resolveToggle} ${event.resolved ? styles.resolveToggleActive : ''}`}
            onClick={() => onResolve(event.id, !event.resolved)}
            title={event.resolved ? 'Mark unresolved' : 'Mark resolved'}
          >
            {event.resolved ? '✓' : 'resolve'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── EventLogPanel ─────────────────────────────────────

const LOAD_LIMIT = 300

export function EventLogPanel() {
  const [events,      setEvents]      = useState<EventLog[]>([])
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [query,       setQuery]       = useState('')
  const [compose,     setCompose]     = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const nowRef    = useRef(new Date().toISOString())
  const userScrolled = useRef(false)

  const { loading } = useQuery(GET_EVENT_LOG, {
    variables: { limit: LOAD_LIMIT },
    onCompleted: data => {
      if (data?.operationeventlog) setEvents([...data.operationeventlog])
    },
  })

  useSubscription(SUB_EVENT_LOG, {
    variables: { now: nowRef.current },
    onData: ({ data }) => {
      const incoming: EventLog[] = data.data?.operationeventlog_stream ?? []
      if (!incoming.length) return
      setEvents(prev => {
        const map = new Map(prev.map(e => [e.id, e]))
        incoming.forEach(e => map.set(e.id, e))
        return Array.from(map.values()).sort((a, b) => b.id - a.id)
      })
    },
  })

  const [insertEvent,   { loading: sending  }] = useMutation(INSERT_EVENT)
  const [updateResolved                       ] = useMutation(UPDATE_EVENT_RESOLVED)
  const [resolveAll,    { loading: resolving }] = useMutation(RESOLVE_ALL_WARNINGS)

  const unresolvedWarnings = useMemo(
    () => events.filter(e => e.warning && !e.resolved).length,
    [events],
  )

  const filtered = useMemo(() => {
    let list = events
    if (levelFilter === 'unresolved') list = list.filter(e => e.warning && !e.resolved)
    else if (levelFilter !== 'all')   list = list.filter(e => e.level === levelFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(e =>
        e.message.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q) ||
        (e.operator?.username ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [events, levelFilter, query])

  const handleResolve = useCallback((id: number, resolved: boolean) => {
    updateResolved({ variables: { id, resolved } })
    setEvents(prev => prev.map(e => e.id === id ? { ...e, resolved } : e))
  }, [updateResolved])

  const handleResolveAll = useCallback(async () => {
    const res = await resolveAll()
    const ids = new Set((res.data?.update_operationeventlog?.returning ?? []).map((r: { id: number }) => r.id))
    if (ids.size > 0) setEvents(prev => prev.map(e => ids.has(e.id) ? { ...e, resolved: true } : e))
  }, [resolveAll])

  async function handleSend() {
    const msg = compose.trim()
    if (!msg) return
    const res = await insertEvent({ variables: { message: msg } })
    const created = res.data?.insert_operationeventlog_one
    if (created) {
      setEvents(prev => [created, ...prev])
      setCompose('')
    }
  }

  function handleComposeKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') setCompose('')
  }

  return (
    <div className={styles.panel}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Event Log</span>

        <div className={styles.levelPills}>
          {LEVELS.map(l => (
            <button
              key={l}
              className={`${styles.pill} ${levelFilter === l ? styles.pillActive : ''}`}
              onClick={() => setLevelFilter(l)}
            >
              {l}
              {(l === 'warning' || l === 'unresolved') && unresolvedWarnings > 0 && (
                <span className={styles.warningCount}>{unresolvedWarnings}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.spacer} />

        <input
          className={styles.searchInput}
          placeholder="/ search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setQuery('')}
          spellCheck={false}
        />

        {unresolvedWarnings > 0 && (
          <button
            className={styles.resolveBtn}
            onClick={handleResolveAll}
            disabled={resolving}
          >
            {resolving ? 'Resolving…' : `Resolve all warnings (${unresolvedWarnings})`}
          </button>
        )}
      </div>

      {/* ── Feed ── */}
      <div className={styles.feed}>
        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            {query || levelFilter !== 'all' ? 'No matching events' : 'No events yet'}
          </div>
        ) : (
          <>
            {filtered.map(event => (
              <EventRow
                key={event.id}
                event={event}
                onResolve={handleResolve}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Compose (team message) ── */}
      <div className={styles.compose}>
        <span className={styles.composePrefix}>msg &gt;</span>
        <input
          className={styles.composeInput}
          placeholder="Send a message to the team…"
          value={compose}
          onChange={e => setCompose(e.target.value)}
          onKeyDown={handleComposeKey}
          spellCheck={false}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={sending || !compose.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
