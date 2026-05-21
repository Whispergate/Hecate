/* ═══════════════════════════════════════════════════
   src/components/ReplayPanel/ReplayPanel.tsx

   Session Replay — a VCR for the engagement. Scrub a playhead
   across the operation's lifetime and the callback graph + task
   feed are reconstructed exactly as they were at that instant.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useQuery }                                          from '@apollo/client'
import { GET_TIMELINE_TASKS, GET_REPLAY_CALLBACKS, GET_REPLAY_EDGES } from '@/apollo/operations'
import { useStore }                                          from '@/store'
import { parseTs }                                           from '@/components/Sidebar/utils'
import { agentColor }                                        from '@/agentColor'
import styles                                                from './ReplayPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface ReplayCallback {
  id: number; display_id: number; host: string; user: string; ip: string
  init_callback: string
  payload: { payloadtype: { name: string } }
}

interface ReplayEdge {
  id: number; source_id: number; destination_id: number
  start_timestamp: string; end_timestamp: string | null
  c2profile: { id: number; name: string; is_p2p: boolean }
}

interface ReplayTask {
  id: number; display_id: number; command_name: string; display_params: string
  status: string; completed: boolean; timestamp: string
  operator: { username: string }
  callback: { id: number; display_id: number; host: string }
}

type TaskT = ReplayTask & { ms: number }

// ── Constants ─────────────────────────────────────────

const SPEEDS = [
  { v: 60,    label: '1m/s'  },
  { v: 600,   label: '10m/s' },
  { v: 3600,  label: '1h/s'  },
  { v: 21600, label: '6h/s'  },
] as const

const NODE_R       = 21
const HUB_R        = 32
const HIST_BUCKETS = 150
const FEED_MAX     = 80

const STATUS_COLOR: Record<string, string> = {
  done:    'var(--crimson-400)',
  error:   'var(--crimson-700)',
  running: 'var(--bone-600)',
}

// ── Helpers ───────────────────────────────────────────

function statusOf(t: { status: string; completed: boolean }): 'done' | 'error' | 'running' {
  if (t.status === 'error') return 'error'
  if (t.completed)          return 'done'
  return 'running'
}

/** Last task in an ascending-by-ms array whose ms <= t (binary search). */
function lastTaskLE(arr: TaskT[], t: number): TaskT | null {
  let lo = 0, hi = arr.length - 1, res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].ms <= t) { res = mid; lo = mid + 1 } else hi = mid - 1
  }
  return res >= 0 ? arr[res] : null
}

/** Count of tasks in an ascending-by-ms array whose ms <= t. */
function countLE(arr: TaskT[], t: number): number {
  let lo = 0, hi = arr.length - 1, res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].ms <= t) { res = mid; lo = mid + 1 } else hi = mid - 1
  }
  return res + 1
}

function fmtClock(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function fmtElapsed(ms: number): string {
  const s   = Math.max(0, Math.floor(ms / 1000))
  const h   = Math.floor(s / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

// ── Component ─────────────────────────────────────────

export function ReplayPanel() {
  const activeOperation = useStore(s => s.activeOperation)
  const annotations     = useStore(s => s.callbackAnnotations)

  const opVars = {
    variables:   { operation_id: activeOperation?.id ?? 0 },
    skip:        !activeOperation,
    fetchPolicy: 'cache-and-network' as const,
  }
  const cbQ   = useQuery(GET_REPLAY_CALLBACKS, opVars)
  const edgeQ = useQuery(GET_REPLAY_EDGES,     opVars)
  const taskQ = useQuery(GET_TIMELINE_TASKS,   opVars)

  const callbacks: ReplayCallback[] = cbQ.data?.callback           ?? []
  const edges:     ReplayEdge[]     = edgeQ.data?.callbackgraphedge ?? []
  const rawTasks:  ReplayTask[]     = taskQ.data?.task              ?? []
  const loading = cbQ.loading || taskQ.loading

  // ── Derived data (depends only on the fetched data, not the playhead) ──

  const sortedTasks: TaskT[] = useMemo(() =>
    rawTasks
      .map(t => ({ ...t, ms: parseTs(t.timestamp).getTime() }))
      .sort((a, b) => a.ms - b.ms),
  [rawTasks])

  const tasksByCb = useMemo(() => {
    const m = new Map<number, TaskT[]>()
    for (const t of sortedTasks) {
      const arr = m.get(t.callback.id)
      if (arr) arr.push(t); else m.set(t.callback.id, [t])
    }
    return m
  }, [sortedTasks])

  // Fixed orbit layout — a callback keeps its slot for the whole replay so
  // nodes never jump around as earlier/later agents appear.
  const layout = useMemo(() => {
    const items = callbacks
      .map(cb => ({ cb, initMs: parseTs(cb.init_callback).getTime() }))
      .sort((a, b) => a.initMs - b.initMs)
    const n      = items.length
    const orbitR = Math.max(170, Math.ceil((n * 72) / (2 * Math.PI)))
    const PAD    = 132
    const center = orbitR + PAD
    const nodes  = items.map((it, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
      return {
        ...it,
        x: center + Math.cos(angle) * orbitR,
        y: center + Math.sin(angle) * orbitR,
      }
    })
    return { nodes, center, VB: center * 2 }
  }, [callbacks])

  const nodeById = useMemo(() => {
    const m = new Map<number, typeof layout.nodes[number]>()
    for (const nd of layout.nodes) m.set(nd.cb.id, nd)
    return m
  }, [layout])

  const { minMs, maxMs } = useMemo(() => {
    let mn = Infinity, mx = -Infinity
    for (const t of sortedTasks) { if (t.ms < mn) mn = t.ms; if (t.ms > mx) mx = t.ms }
    for (const nd of layout.nodes) {
      if (!Number.isFinite(nd.initMs)) continue
      if (nd.initMs < mn) mn = nd.initMs
      if (nd.initMs > mx) mx = nd.initMs
    }
    return Number.isFinite(mn) ? { minMs: mn, maxMs: mx } : { minMs: 0, maxMs: 0 }
  }, [sortedTasks, layout])

  const span        = Math.max(maxMs - minMs, 1)
  const pulseWindow = Math.max(span / 90, 20_000)

  const histogram = useMemo(() => {
    const buckets = new Array<number>(HIST_BUCKETS).fill(0)
    for (const t of sortedTasks) {
      let idx = Math.floor(((t.ms - minMs) / span) * HIST_BUCKETS)
      idx = Math.min(HIST_BUCKETS - 1, Math.max(0, idx))
      buckets[idx]++
    }
    const max = Math.max(1, ...buckets)
    return buckets.map(c => c / max)
  }, [sortedTasks, minMs, span])

  // ── Playhead state ──

  const [scrubT,  setScrubT]  = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed,   setSpeed]   = useState<number>(600)
  const [focusCb, setFocusCb] = useState<number | null>(null)

  const scrubRef  = useRef(0)
  const initedRef = useRef(false)
  useEffect(() => { scrubRef.current = scrubT }, [scrubT])

  // First data load → park the playhead at the end (= current reality).
  useEffect(() => {
    if (!initedRef.current && maxMs > minMs) {
      initedRef.current = true
      scrubRef.current  = maxMs
      setScrubT(maxMs)
    }
  }, [maxMs, minMs])

  const seek = useCallback((t: number) => {
    const clamped = Math.min(maxMs, Math.max(minMs, t))
    scrubRef.current = clamped
    setScrubT(clamped)
  }, [minMs, maxMs])

  // Playback loop — advance sim-time by (real Δt × speed) each frame.
  useEffect(() => {
    if (!playing) return
    let raf  = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt   = now - last
      last       = now
      const next = Math.min(maxMs, scrubRef.current + dt * speed)
      scrubRef.current = next
      setScrubT(next)
      if (next >= maxMs) { setPlaying(false); return }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, maxMs])

  const togglePlay = useCallback(() => {
    setPlaying(p => {
      // Pressing play at the end rewinds to the start, like a media player.
      if (!p && scrubRef.current >= maxMs - 1) {
        scrubRef.current = minMs
        setScrubT(minMs)
      }
      return !p
    })
  }, [minMs, maxMs])

  const stepEvent = useCallback((dir: 1 | -1) => {
    setPlaying(false)
    const cur = scrubRef.current
    if (dir > 0) {
      const nxt = sortedTasks.find(t => t.ms > cur + 1)
      if (nxt) seek(nxt.ms)
    } else {
      let prev: number | null = null
      for (const t of sortedTasks) {
        if (t.ms < cur - 1) prev = t.ms; else break
      }
      if (prev != null) seek(prev)
    }
  }, [sortedTasks, seek])

  // Keyboard transport — space to play/pause, arrows to step events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if      (e.code === 'Space')      { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowRight') { stepEvent(1) }
      else if (e.code === 'ArrowLeft')  { stepEvent(-1) }
      else if (e.code === 'Home')       { setPlaying(false); seek(minMs) }
      else if (e.code === 'End')        { setPlaying(false); seek(maxMs) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, stepEvent, seek, minMs, maxMs])

  // ── Graph pan / zoom ──

  const svgRef  = useRef<SVGSVGElement>(null)
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const drag    = useRef<{ ox: number; oy: number; tx: number; ty: number } | null>(null)
  const didDrag = useRef(false)
  const VB      = layout.VB

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width)  * VB
      const my = ((e.clientY - rect.top)  / rect.height) * VB
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setView(v => {
        const scale = Math.min(5, Math.max(0.4, v.scale * factor))
        return {
          scale,
          tx: mx - (mx - v.tx) * (scale / v.scale),
          ty: my - (my - v.ty) * (scale / v.scale),
        }
      })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [VB])

  const onSvgDown = useCallback((e: React.MouseEvent) => {
    drag.current    = { ox: e.clientX, oy: e.clientY, tx: view.tx, ty: view.ty }
    didDrag.current = false
  }, [view])

  const onSvgMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    if (Math.abs(e.clientX - drag.current.ox) + Math.abs(e.clientY - drag.current.oy) > 3) {
      didDrag.current = true
    }
    setView(v => ({
      ...v,
      tx: drag.current!.tx + (e.clientX - drag.current!.ox) * (VB / rect.width),
      ty: drag.current!.ty + (e.clientY - drag.current!.oy) * (VB / rect.height),
    }))
  }, [VB])

  const onSvgUp   = useCallback(() => { drag.current = null }, [])
  const resetView = useCallback(() => setView({ tx: 0, ty: 0, scale: 1 }), [])

  // ── Scrubber drag ──

  const trackRef = useRef<HTMLDivElement>(null)
  const onScrubDown = useCallback((e: React.MouseEvent) => {
    setPlaying(false)
    const track = trackRef.current
    if (!track) return
    const rect  = track.getBoundingClientRect()
    const apply = (clientX: number) => {
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seek(minMs + frac * span)
    }
    apply(e.clientX)
    const move = (ev: MouseEvent) => apply(ev.clientX)
    const up   = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup',   up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup',   up)
  }, [minMs, span, seek])

  // ── Per-frame derivations (T = current playhead) ──

  const T = scrubT

  // P2P parent links that are open at time T.
  const parentMap = new Map<number, number>()
  for (const e of edges) {
    if (!e.c2profile.is_p2p || e.source_id === e.destination_id) continue
    const s  = parseTs(e.start_timestamp).getTime()
    const en = e.end_timestamp ? parseTs(e.end_timestamp).getTime() : Infinity
    if (s <= T && T < en) parentMap.set(e.destination_id, e.source_id)
  }

  const visibleNodes = layout.nodes.filter(nd =>
    (Number.isFinite(nd.initMs) ? nd.initMs : minMs) <= T)
  const visibleIds = new Set(visibleNodes.map(nd => nd.cb.id))

  const tasksSoFar = countLE(sortedTasks, T)

  const feed = useMemo(() => {
    let arr = sortedTasks.slice(0, countLE(sortedTasks, T))
    if (focusCb != null) arr = arr.filter(t => t.callback.id === focusCb)
    return arr.slice(-FEED_MAX).reverse()
  }, [sortedTasks, T, focusCb])

  const pct = Math.min(100, Math.max(0, ((scrubT - minMs) / span) * 100))
  const c   = layout.center

  // ── Render ──

  return (
    <div className={styles.panel}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Session Replay</span>
          <span className={styles.meta}>
            {loading && !sortedTasks.length
              ? 'loading…'
              : `${visibleNodes.length}/${callbacks.length} agents · ${tasksSoFar}/${sortedTasks.length} tasks`}
          </span>
        </div>
        <div className={styles.headerRight}>
          {(view.scale !== 1 || view.tx !== 0 || view.ty !== 0) && (
            <button className={styles.ghostBtn} onClick={resetView}>reset view</button>
          )}
          <span className={styles.headerClock}>{fmtClock(scrubT)}</span>
        </div>
      </div>

      {/* ── Body: graph + feed ── */}
      <div className={styles.body}>
        <div className={styles.graphWrap}>
          {!loading && callbacks.length === 0 ? (
            <div className={styles.empty}>no callbacks in this operation</div>
          ) : (
            <svg
              ref={svgRef}
              className={styles.svg}
              viewBox={`0 0 ${VB} ${VB}`}
              style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
              onMouseDown={onSvgDown}
              onMouseMove={onSvgMove}
              onMouseUp={onSvgUp}
              onMouseLeave={onSvgUp}
            >
              <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>

                {/* Connection lines */}
                {visibleNodes.map(nd => {
                  const parentId = parentMap.get(nd.cb.id)
                  let ox = c, oy = c, oR = HUB_R, isP2P = false
                  if (parentId != null && visibleIds.has(parentId)) {
                    const pn = nodeById.get(parentId)
                    if (pn) { ox = pn.x; oy = pn.y; oR = NODE_R; isP2P = true }
                  }
                  const dx  = nd.x - ox, dy = nd.y - oy
                  const len = Math.hypot(dx, dy) || 1
                  return (
                    <line
                      key={`e${nd.cb.id}`}
                      x1={ox + dx / len * oR}     y1={oy + dy / len * oR}
                      x2={nd.x - dx / len * NODE_R} y2={nd.y - dy / len * NODE_R}
                      stroke={isP2P ? 'var(--crimson-500)' : agentColor(nd.cb.payload.payloadtype.name)}
                      strokeWidth={isP2P ? 1.6 : 1.1}
                      strokeDasharray={isP2P ? '5 3' : undefined}
                      opacity={0.5}
                    />
                  )
                })}

                {/* C2 hub */}
                <circle cx={c} cy={c} r={HUB_R} fill="var(--topo-c2-bg)" stroke="var(--crimson-500)" strokeWidth={2} />
                <text x={c} y={c - 1}  textAnchor="middle" className={styles.hubText}>C2</text>
                <text x={c} y={c + 11} textAnchor="middle" className={styles.hubSub}>
                  {activeOperation?.name?.slice(0, 14) ?? ''}
                </text>

                {/* Agent nodes */}
                {visibleNodes.map(nd => {
                  const cb      = nd.cb
                  const cbTasks = tasksByCb.get(cb.id) ?? []
                  const last    = lastTaskLE(cbTasks, T)
                  const recent  = last != null && (T - last.ms) <= pulseWindow
                  const annot   = annotations[cb.display_id]
                  const stroke  = annot
                    || (recent && last ? STATUS_COLOR[statusOf(last)] : agentColor(cb.payload.payloadtype.name))
                  const focused = focusCb === cb.id
                  return (
                    <g
                      key={cb.id}
                      className={styles.node}
                      onClick={() => { if (!didDrag.current) setFocusCb(f => f === cb.id ? null : cb.id) }}
                    >
                      <title>{`${cb.host} · #${cb.display_id} · ${cb.payload.payloadtype.name} · ${cb.user || '—'}`}</title>

                      {recent && (
                        <circle
                          cx={nd.x} cy={nd.y} r={NODE_R + 6}
                          fill="none" stroke={stroke} strokeWidth={1.5}
                          className={styles.pulse}
                        />
                      )}

                      <circle
                        cx={nd.x} cy={nd.y} r={NODE_R}
                        fill="var(--bg-elevated)" stroke={stroke}
                        strokeWidth={focused ? 3 : recent ? 2.4 : 1.6}
                        opacity={focused || recent ? 1 : 0.92}
                      />
                      <image
                        href={`/static/${cb.payload.payloadtype.name}_dark.svg`}
                        x={nd.x - 13} y={nd.y - 13} width="26" height="26"
                      />

                      <text x={nd.x} y={nd.y + NODE_R + 13} textAnchor="middle"
                            className={styles.nodeLabel} fill={annot || 'var(--bone-500)'}>
                        {cb.host || '—'}
                      </text>
                      <text x={nd.x} y={nd.y + NODE_R + 24} textAnchor="middle" className={styles.nodeSub}>
                        #{cb.display_id} · {cb.user || '—'}
                      </text>

                      {recent && last && (
                        <g>
                          <rect
                            x={nd.x - 46} y={nd.y - NODE_R - 19} width={92} height={15} rx={2}
                            fill="var(--bg-raised)" stroke={STATUS_COLOR[statusOf(last)]} strokeWidth={0.7}
                          />
                          <text x={nd.x} y={nd.y - NODE_R - 8.5} textAnchor="middle"
                                className={styles.cmdFlag} fill={STATUS_COLOR[statusOf(last)]}>
                            {last.command_name.slice(0, 14)}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        {/* ── Task feed ── */}
        <div className={styles.feed}>
          <div className={styles.feedHead}>
            <span>{focusCb != null ? 'callback feed' : 'task stream'}</span>
            {focusCb != null && (
              <button className={styles.clearFocus} onClick={() => setFocusCb(null)}>clear ✕</button>
            )}
          </div>
          <div className={styles.feedList}>
            {feed.length === 0 && (
              <div className={styles.feedEmpty}>no tasks issued yet at this point</div>
            )}
            {feed.map(t => {
              const isNew = (T - t.ms) <= pulseWindow
              return (
                <button
                  key={t.id}
                  className={`${styles.feedRow} ${isNew ? styles.feedRowNew : ''}`}
                  onClick={() => seek(t.ms)}
                >
                  <span className={styles.feedDot} style={{ background: STATUS_COLOR[statusOf(t)] }} />
                  <div className={styles.feedBody}>
                    <div className={styles.feedCmd}>
                      <span className={styles.feedCmdName}>{t.command_name}</span>
                      {t.display_params && <span className={styles.feedParams}> {t.display_params}</span>}
                    </div>
                    <div className={styles.feedMeta}>
                      {t.callback.host} #{t.callback.display_id} · {t.operator.username} · {
                        new Date(t.ms).toLocaleTimeString([], {
                          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                        })
                      }
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Transport bar ── */}
      <div className={styles.transport}>
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} title="Jump to start"
                  onClick={() => { setPlaying(false); seek(minMs) }}>⏮</button>
          <button className={styles.ctrlBtn} title="Previous event (←)"
                  onClick={() => stepEvent(-1)}>⏪</button>
          <button className={`${styles.ctrlBtn} ${styles.playBtn}`} title="Play / pause (space)"
                  onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
          <button className={styles.ctrlBtn} title="Next event (→)"
                  onClick={() => stepEvent(1)}>⏩</button>
          <button className={styles.ctrlBtn} title="Jump to end"
                  onClick={() => { setPlaying(false); seek(maxMs) }}>⏭</button>
        </div>

        <div className={styles.speeds}>
          {SPEEDS.map(s => (
            <button
              key={s.v}
              className={`${styles.speedBtn} ${speed === s.v ? styles.speedActive : ''}`}
              onClick={() => setSpeed(s.v)}
            >{s.label}</button>
          ))}
        </div>

        <div className={styles.track} ref={trackRef} onMouseDown={onScrubDown}>
          <div className={styles.hist}>
            {histogram.map((h, i) => (
              <div key={i} className={styles.bar}
                   style={{ height: `${h > 0 ? Math.max(h * 100, 6) : 0}%` }} />
            ))}
          </div>
          <div className={styles.scrubFill} style={{ width: `${pct}%` }} />
          {layout.nodes.map(nd => Number.isFinite(nd.initMs) && (
            <div
              key={nd.cb.id}
              className={styles.initMark}
              style={{ left: `${((nd.initMs - minMs) / span) * 100}%` }}
              title={`${nd.cb.host} joined`}
            />
          ))}
          <div className={styles.playhead} style={{ left: `${pct}%` }}>
            <div className={styles.playheadGrip} />
          </div>
        </div>

        <div className={styles.clock}>
          <span className={styles.clockMain}>{fmtClock(scrubT)}</span>
          <span className={styles.clockSub}>
            +{fmtElapsed(scrubT - minMs)} / {fmtElapsed(span)}
          </span>
        </div>
      </div>
    </div>
  )
}
