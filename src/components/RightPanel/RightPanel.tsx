/* ═══════════════════════════════════════════════════
   src/components/RightPanel/RightPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useQuery, useSubscription }                        from '@apollo/client'
import { useRef, useState, useCallback, useEffect }         from 'react'
import { CallbackContextMenu }                              from '@/components/CallbackContextMenu/CallbackContextMenu'
import { GET_OPERATIONS, SUB_ALL_CALLBACKS }                from '@/apollo/operations'
import { useStore, useSelectedCallback, useAliveCallbacks } from '@/store'
import type { Callback }                                    from '@/store'
import { parseTs, formatSleepInterval, formatSleepJitter }  from '@/components/Sidebar/utils'
import styles                                               from './RightPanel.module.css'

// ── Protocol helpers ──────────────────────────────────

type ProtoInfo = { color: string; dash?: string; short: string }

function protocolInfo(c2name: string): ProtoInfo {
  const n = c2name.toLowerCase()
  if (n.includes('http'))   return { color: 'var(--proto-http)',    short: 'HTTP'  }
  if (n.includes('smb'))    return { color: 'var(--proto-smb)',     short: 'SMB',  dash: '4 2' }
  if (n.includes('tcp'))    return { color: 'var(--proto-tcp)',     short: 'TCP',  dash: '2 2' }
  if (n.includes('ws') || n.includes('socket'))
                            return { color: 'var(--proto-ws)',      short: 'WS',   dash: '6 2' }
  if (n.includes('dns'))    return { color: 'var(--proto-dns)',     short: 'DNS',  dash: '1 3' }
  return                           { color: 'var(--proto-default)', short: c2name.toUpperCase().slice(0,4) }
}

// ── Late-checkin detection ────────────────────────────

function parseSleepSeconds(cb: Callback): number {
  const raw = cb.sleep_info?.trim()
  if (raw) {
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw) as Record<string, { interval?: number }>
        const first = Object.values(obj)[0]
        if (first?.interval !== undefined) return first.interval
      } catch { /* fall through */ }
    } else {
      const token = raw.toLowerCase().split(/\s+/)[0]
      if (token.endsWith('h')) return parseFloat(token) * 3600
      if (token.endsWith('m')) return parseFloat(token) * 60
      if (token.endsWith('s')) return parseFloat(token)
      const n = parseFloat(token)
      if (!isNaN(n)) return n
    }
  }
  // fall back to last sleep task
  if (cb.tasks[0]) {
    try {
      const p = JSON.parse(cb.tasks[0].params) as { interval?: number }
      if (p.interval !== undefined) return p.interval
    } catch { /* fall through */ }
  }
  // fall back to payload config
  const iv = cb.payload.c2profileparametersinstances
    .find(p => p.c2profileparameter.name === 'callback_interval')?.value
  return iv !== undefined ? parseFloat(iv) : 0
}

function isLateCheckin(cb: Callback): boolean {
  const sleepSecs = parseSleepSeconds(cb)
  const elapsed   = (Date.now() - parseTs(cb.last_checkin).getTime()) / 1000
  // sleep=0 means continuous check-in — threshold is just the 5-min grace window
  // sleep>0 — threshold is the interval plus 5-min grace
  const threshold = sleepSecs > 0 ? sleepSecs + 300 : 300
  return elapsed > threshold
}

// ── Topology SVG ──────────────────────────────────────

const C2_X = 122
const C2_Y = 28
const C2_R = 11

const MIN_SCALE = 0.5
const MAX_SCALE = 4

// Minimum px gap between node edges (node r=9, so diameter=18; 26 = 18 + 8 gap)
const NODE_MIN_SPACING = 26

interface CtxMenu { cb: Callback; x: number; y: number }

function NetworkTopology({ callbacks, selectedId, onSelect }: {
  callbacks: Callback[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const n = callbacks.length

  // Dynamic orbit radius: enough circumference to fit all nodes without overlap
  const orbitR = n <= 1 ? 55 : Math.max(55, Math.ceil((n * NODE_MIN_SPACING) / (2 * Math.PI)))

  // C2 hub sits at center-x, top-padded so the full circle fits below
  const cx   = 122
  const cy   = orbitR + 22          // top pad + radius
  const vbH  = cy + orbitR + 30     // bottom pad for hostname labels + legend

  const svgRef = useRef<SVGSVGElement>(null)
  const [tx, setTx]       = useState(0)
  const [ty, setTy]       = useState(0)
  const [scale, setScale] = useState(1)
  const drag    = useRef<{ ox: number; oy: number; tx: number; ty: number } | null>(null)
  const didDrag = useRef(false)

  // Non-passive wheel listener — React's synthetic onWheel is passive and
  // cannot call preventDefault(), which lets the page scroll underneath.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width)  * 244
      const my = ((e.clientY - rect.top)  / rect.height) * vbH
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setScale(s => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor))
        setTx(t => mx - (mx - t) * (next / s))
        setTy(t => my - (my - t) * (next / s))
        return next
      })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [vbH])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current  = { ox: e.clientX, oy: e.clientY, tx, ty }
    didDrag.current = false
  }, [tx, ty])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    setTx(drag.current.tx + (e.clientX - drag.current.ox) * (244 / rect.width))
    setTy(drag.current.ty + (e.clientY - drag.current.oy) * (vbH / rect.height))
    didDrag.current = true
  }, [vbH])

  const onMouseUp = useCallback(() => { drag.current = null }, [])
  const resetView   = useCallback(() => { setTx(0); setTy(0); setScale(1) }, [])

  const legendProtos = Array.from(
    new Map(
      callbacks.map(cb => {
        const name = cb.callbackc2profiles[0]?.c2profile.name ?? 'unknown'
        const info = protocolInfo(name)
        return [info.short, info]
      })
    ).values()
  )

  return (
    <div style={{ position: 'relative' }}>
      {(tx !== 0 || ty !== 0 || scale !== 1) && (
        <button onClick={resetView} className={styles.topoReset} title="Reset view">⟳</button>
      )}
      {ctxMenu && (
        <CallbackContextMenu
          cb={ctxMenu.cb}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
      <svg
        ref={svgRef}
        className={styles.netSvg}
        viewBox={`0 0 244 ${vbH}`}
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <g transform={`translate(${tx},${ty}) scale(${scale})`}>

          {/* ── C2 hub ── */}
          <circle cx={cx} cy={cy} r={C2_R} fill="var(--topo-c2-bg)" stroke="var(--crimson-500)" strokeWidth="1.5" />
          <text x={cx} y={cy + 3} textAnchor="middle" fontFamily="monospace" fontSize="6.5" fill="var(--topo-text-accent)">C2</text>

          {/* ── Agent nodes — evenly spaced around full circle ── */}
          {callbacks.map((cb, i) => {
            const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
            const nx = cx + Math.cos(angle) * orbitR
            const ny = cy + Math.sin(angle) * orbitR

            const c2name      = cb.callbackc2profiles[0]?.c2profile.name ?? 'unknown'
            const proto       = protocolInfo(c2name)
            const alive       = cb.active
            const isSel       = cb.id === selectedId
            const late        = alive && isLateCheckin(cb)
            const lineColor   = !alive ? 'var(--topo-dead-line)' : proto.color
            const lineDash    = !alive ? '3 3' : late ? '2 8' : proto.dash
            const lineOpacity = alive ? (late ? 0.35 : 0.75) : 0.4

            // Line endpoints: C2 edge → node edge (along the connecting vector)
            const dx  = nx - cx, dy = ny - cy
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const x1  = cx + (dx / len) * C2_R
            const y1  = cy + (dy / len) * C2_R
            const x2  = nx - (dx / len) * 9
            const y2  = ny - (dy / len) * 9

            // Protocol label midpoint
            const mx2 = (x1 + x2) / 2
            const my2 = (y1 + y2) / 2

            return (
              <g
                key={cb.id}
                onClick={() => { if (!didDrag.current) onSelect(cb.id) }}
                onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ cb, x: e.clientX, y: e.clientY }) }}
                style={{ cursor: 'pointer' }}
              >
                {/* Connection line */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={lineColor}
                  strokeWidth={isSel ? 1.8 : 1}
                  strokeDasharray={lineDash}
                  opacity={lineOpacity}
                />

                {/* Protocol label */}
                {alive && (
                  <g>
                    <rect x={mx2 - 9} y={my2 - 6} width={18} height={9} rx="1" fill="var(--topo-label-bg)" />
                    <text x={mx2} y={my2 + 1} textAnchor="middle" fontFamily="monospace" fontSize="5.5" fontWeight="bold" fill={lineColor}>
                      {proto.short}
                    </text>
                  </g>
                )}

                {/* Agent node */}
                <circle
                  cx={nx} cy={ny} r="9"
                  fill={isSel ? 'var(--topo-node-sel)' : 'var(--topo-node-bg)'}
                  stroke={alive ? lineColor : 'var(--topo-dead-line)'}
                  strokeWidth={isSel ? 1.8 : 1}
                  strokeOpacity={isSel ? 1 : (alive ? 0.6 : 1)}
                />

                {/* Agent icon */}
                <image
                  href={`/static/${cb.payload.payloadtype.name}_dark.svg`}
                  x={nx - 6} y={ny - 6} width="12" height="12"
                  opacity={alive ? 1 : 0.4}
                />

                {/* Live pulse dot */}
                {alive && !late && (
                  <circle cx={nx + 6.5} cy={ny - 6.5} r="2.5" fill="var(--status-alive)" opacity="0.9" />
                )}

                {/* Hostname — pushed outward from the circle center */}
                <text
                  x={cx + Math.cos(angle) * (orbitR + 14)}
                  y={cy + Math.sin(angle) * (orbitR + 14) + 2}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontSize="5.5"
                  fill={isSel ? 'var(--topo-text-node-sel)' : 'var(--topo-text-node)'}
                >
                  {cb.host.slice(0, 10)}
                </text>
              </g>
            )
          })}

          {n === 0 && (
            <text x={cx} y={cy + 20} textAnchor="middle" fontFamily="monospace" fontSize="8" fill="var(--topo-text-info)">
              no agents
            </text>
          )}

          {/* ── Protocol legend ── */}
          {legendProtos.length > 0 && (
            <g transform={`translate(6, ${vbH - 12})`}>
              {legendProtos.map((p, i) => (
                <g key={p.short} transform={`translate(${i * 52}, 0)`}>
                  <line x1="0" y1="5" x2="12" y2="5" stroke={p.color} strokeWidth="1.5" strokeDasharray={p.dash} />
                  <text x="15" y="8" fontFamily="monospace" fontSize="6" fill={p.color}>{p.short}</text>
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────

export function RightPanel() {
  const aliveCallbacks     = useAliveCallbacks()       // active:true only — for stats
  const currentTasks       = useStore((s) => s.currentTasks)
  const selectedCallbackId    = useStore((s) => s.selectedCallbackId)
  const setSelectedCallbackId = useStore((s) => s.setSelectedCallbackId)
  const selected              = useSelectedCallback()
  const activeOp           = useStore((s) => s.activeOperation)

  // All callbacks (including inactive) for topology — shows dead nodes too
  const { data: allCbData } = useSubscription(SUB_ALL_CALLBACKS, {
    variables: { operation_id: activeOp?.id ?? 0 },
    skip: !activeOp,
  })
  const allCallbacks: Callback[] = allCbData?.callback ?? aliveCallbacks

  useQuery(GET_OPERATIONS, { skip: !activeOp, fetchPolicy: 'cache-first' })

  const errorCount = currentTasks.filter(t => t.status === 'error').length

  return (
    <aside className={styles.panel}>

      {/* ── Operation stats ── */}
      <div className={styles.section}>
        <div className="sec-label">Operation</div>
        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statVal} ${styles.ok}`}>{aliveCallbacks.length}</div>
            <div className={styles.statLbl}>Live agents</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statVal} ${styles.cr}`}>{allCallbacks.length}</div>
            <div className={styles.statLbl}>Callbacks</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{currentTasks.length}</div>
            <div className={styles.statLbl}>Tasks</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statVal} ${errorCount > 0 ? styles.warn : ''}`}>
              {errorCount}
            </div>
            <div className={styles.statLbl}>Errors</div>
          </div>
        </div>
      </div>

      {/* ── Network topology ── */}
      <div className={styles.section}>
        <div className="sec-label">Network topology</div>
        <NetworkTopology callbacks={allCallbacks} selectedId={selectedCallbackId} onSelect={setSelectedCallbackId} />
      </div>

      {/* ── Selected agent detail ── */}
      {selected && (
        <div className={styles.section}>
          <div className="sec-label">Agent info</div>
          <table className={styles.infoTable}>
            <tbody>
              {[
                ['Arch',    selected.architecture || '—'],
                ['Domain',  selected.domain || '—'],
                ['PID',     String(selected.pid)],
                ['Sleep',   formatSleepInterval(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)],
                ['Jitter',  formatSleepJitter(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)],
                ['Agent',   selected.payload.payloadtype.name],
                ['C2',      selected.callbackc2profiles[0]?.c2profile.name ?? '—'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className={styles.tdKey}>{k}</td>
                  <td className={styles.tdVal}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Task breakdown ── */}
      {currentTasks.length > 0 && (
        <div className={styles.section}>
          <div className="sec-label">Task status</div>
          <div className={styles.taskBreakdown}>
            {[
              { label: 'Completed', count: currentTasks.filter(t => t.completed).length,                               color: 'var(--status-ok-text)'  },
              { label: 'Running',   count: currentTasks.filter(t => !t.completed && t.status !== 'error').length,      color: 'var(--crimson-300)'     },
              { label: 'Errors',    count: errorCount,                                                                  color: 'var(--status-err-text)' },
            ].map(({ label, count, color }) => (
              <div key={label} className={styles.taskBreakdownRow}>
                <span className={styles.tbLabel}>{label}</span>
                <span className={styles.tbCount} style={{ color }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MITRE ATT&CK ── */}
      <div className={styles.section}>
        <div className="sec-label">MITRE ATT&CK</div>
        <div className={styles.tags}>
          {['TA0002','TA0004','TA0005','TA0006','T1059.001','T1055','T1003','T1078','T1105'].map(t => (
            <span key={t} className={styles.tag}>{t}</span>
          ))}
        </div>
        <div className={styles.miniBar}>
          <div className={styles.miniFill} style={{ width: '38%' }} />
        </div>
        <div className={styles.coverageLbl}>38% technique coverage</div>
      </div>

    </aside>
  )
}
