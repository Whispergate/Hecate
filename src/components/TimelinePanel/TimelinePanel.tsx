/* ═══════════════════════════════════════════════════
   src/components/TimelinePanel/TimelinePanel.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useMemo } from 'react'
import { useQuery }                              from '@apollo/client'
import { GET_TIMELINE_TASKS }                    from '@/apollo/operations'
import { useStore }                              from '@/store'
import { parseTs }                               from '@/components/Sidebar/utils'
import styles                                    from './TimelinePanel.module.css'

// ── Types ─────────────────────────────────────────────

interface TaskRow {
  id:             number
  display_id:     number
  command_name:   string
  display_params: string
  status:         string
  completed:      boolean
  timestamp:      string
  operator:       { username: string }
  callback:       { id: number; display_id: number; host: string }
}

interface EventData extends TaskRow {
  leftPct: number
}

interface CallbackTrack {
  cbId:      number
  displayId: number
  host:      string
  color:     string
  events:    EventData[]
}

// ── Constants ──────────────────────────────────────────

const LABEL_W  = 188
const TRACK_H  = 44
const AXIS_H   = 34

const TRACK_PALETTE = [
  'var(--track-1)', 'var(--track-2)', 'var(--track-3)', 'var(--track-4)',
  'var(--track-5)', 'var(--track-6)', 'var(--track-7)', 'var(--track-8)',
]

const NICE_INTERVALS_MS = [
  1_000, 5_000, 10_000, 30_000,
  60_000, 300_000, 900_000, 1_800_000,
  3_600_000, 14_400_000, 43_200_000, 86_400_000,
]

const ZOOM_LEVELS = [1, 2, 4, 8] as const
type ZoomLevel = typeof ZOOM_LEVELS[number]

// ── Helpers ───────────────────────────────────────────

function pickTickInterval(spanMs: number): number {
  const raw = spanMs / 8
  return NICE_INTERVALS_MS.find(i => i >= raw) ?? NICE_INTERVALS_MS[NICE_INTERVALS_MS.length - 1]
}

function fmtTickLabel(ms: number, spanMs: number): string {
  const d = new Date(ms)
  if (spanMs < 3_600_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
  if (spanMs < 86_400_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

function eventStatus(t: TaskRow): 'done' | 'error' | 'running' {
  if (t.status === 'error') return 'error'
  if (t.completed)          return 'done'
  return 'running'
}

// ── Component ─────────────────────────────────────────

export function TimelinePanel() {
  const [filter,   setFilter]   = useState('')
  const [zoom,     setZoom]     = useState<ZoomLevel>(1)
  const [selected, setSelected] = useState<EventData | null>(null)

  const activeOperation = useStore(s => s.activeOperation)
  const annotations     = useStore(s => s.callbackAnnotations)

  const { data, loading } = useQuery(GET_TIMELINE_TASKS, {
    variables:   { operation_id: activeOperation?.id ?? 0 },
    skip:        !activeOperation,
    fetchPolicy: 'cache-and-network',
  })

  const allTasks: TaskRow[] = data?.task ?? []

  const filterLc = filter.toLowerCase()
  const filtered = useMemo(() => {
    if (!filterLc) return allTasks
    return allTasks.filter(t =>
      t.callback.host.toLowerCase().includes(filterLc) ||
      t.command_name.toLowerCase().includes(filterLc) ||
      (t.display_params ?? '').toLowerCase().includes(filterLc)
    )
  }, [allTasks, filterLc])

  const { minMs, maxMs, spanMs } = useMemo(() => {
    if (!filtered.length) return { minMs: 0, maxMs: 0, spanMs: 1 }
    let mn = Infinity, mx = -Infinity
    for (const t of filtered) {
      const ms = parseTs(t.timestamp).getTime()
      if (ms < mn) mn = ms
      if (ms > mx) mx = ms
    }
    return { minMs: mn, maxMs: mx, spanMs: Math.max(mx - mn, 1) }
  }, [filtered])

  const tracks: CallbackTrack[] = useMemo(() => {
    const map = new Map<number, CallbackTrack>()
    for (const t of filtered) {
      const cbId = t.callback.id
      if (!map.has(cbId)) {
        const idx        = map.size
        const annotColor = annotations[t.callback.display_id]
        map.set(cbId, {
          cbId,
          displayId: t.callback.display_id,
          host:      t.callback.host,
          color:     annotColor || TRACK_PALETTE[idx % TRACK_PALETTE.length],
          events:    [],
        })
      }
      const ms     = parseTs(t.timestamp).getTime()
      const leftPct = (ms - minMs) / spanMs * 100
      map.get(cbId)!.events.push({ ...t, leftPct })
    }
    return Array.from(map.values()).sort((a, b) => a.displayId - b.displayId)
  }, [filtered, minMs, spanMs, annotations])

  const ticks = useMemo(() => {
    if (spanMs <= 1) return []
    const interval  = pickTickInterval(spanMs)
    const firstTick = Math.ceil(minMs / interval) * interval
    const result    = []
    for (let ms = firstTick; ms <= maxMs; ms += interval) {
      result.push({ ms, leftPct: (ms - minMs) / spanMs * 100, label: fmtTickLabel(ms, spanMs) })
    }
    return result
  }, [minMs, maxMs, spanMs])

  const innerH = AXIS_H + tracks.length * TRACK_H

  return (
    <div className={styles.panel}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Attack Timeline</span>
          <span className={styles.meta}>
            {loading ? 'loading…' : `${filtered.length} tasks · ${tracks.length} callbacks`}
          </span>
        </div>
        <div className={styles.headerRight}>
          <input
            className={styles.filterInput}
            placeholder="filter host / command…"
            value={filter}
            onChange={e => { setFilter(e.target.value); setSelected(null) }}
          />
          <div className={styles.zoomBtns}>
            {ZOOM_LEVELS.map(z => (
              <button
                key={z}
                className={`${styles.zoomBtn} ${zoom === z ? styles.zoomActive : ''}`}
                onClick={() => setZoom(z)}
              >{z}×</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scroll area ── */}
      <div className={styles.scrollArea}>
        {tracks.length === 0 && !loading && (
          <div className={styles.empty}>
            {filterLc ? `no tasks matching "${filter}"` : 'no tasks in this operation'}
          </div>
        )}

        {tracks.length > 0 && (
          <div className={styles.inner} style={{ width: `${zoom * 100}%`, minHeight: `${innerH}px` }}>

            {/* Time axis */}
            <div className={styles.axisRow} style={{ height: `${AXIS_H}px` }}>
              <div className={styles.labelCell} style={{ width: `${LABEL_W}px` }}>
                <span className={styles.axisLabel}>time</span>
              </div>
              <div className={styles.axisTrack}>
                {ticks.map(tick => (
                  <div key={tick.ms} className={styles.tick} style={{ left: `${tick.leftPct}%` }}>
                    <div className={styles.tickNub} />
                    <span className={styles.tickLabel}>{tick.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Callback swimlanes */}
            {tracks.map(track => (
              <div key={track.cbId} className={styles.trackRow} style={{ height: `${TRACK_H}px` }}>
                <div className={styles.labelCell} style={{ width: `${LABEL_W}px` }}>
                  <span className={styles.trackDot} style={{ background: track.color }} />
                  <span className={styles.trackHost} title={track.host}>{track.host}</span>
                  <span className={styles.trackId}>#{track.displayId}</span>
                </div>
                <div className={styles.trackArea}>
                  <div className={styles.trackLine} style={{ background: track.color }} />
                  {track.events.map(ev => (
                    <button
                      key={ev.id}
                      className={[
                        styles.event,
                        styles[`ev_${eventStatus(ev)}`],
                        selected?.id === ev.id ? styles.evSelected : '',
                      ].join(' ')}
                      style={{ left: `${ev.leftPct}%` }}
                      onClick={() => setSelected(s => s?.id === ev.id ? null : ev)}
                      title={`${ev.command_name}${ev.display_params ? ' ' + ev.display_params : ''}\n${ev.status} · ${ev.operator.username}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Selected event detail bar ── */}
      {selected && (
        <div className={styles.detail}>
          <button className={styles.detailClose} onClick={() => setSelected(null)}>✕</button>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>host</span>
            <span className={styles.diValue}>{selected.callback.host}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>callback</span>
            <span className={styles.diValue}>#{selected.callback.display_id}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>task</span>
            <span className={styles.diValue}>#{selected.display_id}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>command</span>
            <span className={`${styles.diValue} ${styles.diMono}`}>
              {selected.command_name}{selected.display_params ? ` ${selected.display_params}` : ''}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>status</span>
            <span className={`${styles.diValue} ${styles[`diSt_${eventStatus(selected)}`]}`}>
              {selected.status}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>time</span>
            <span className={styles.diValue}>{parseTs(selected.timestamp).toLocaleString()}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.diLabel}>operator</span>
            <span className={styles.diValue}>{selected.operator.username}</span>
          </div>
        </div>
      )}
    </div>
  )
}
