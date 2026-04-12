/* ═══════════════════════════════════════════════════
   src/components/RightPanel/RightPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useQuery, useSubscription }                        from '@apollo/client'
import { GET_OPERATIONS, SUB_ALL_CALLBACKS }                from '@/apollo/operations'
import { useStore, useSelectedCallback, useAliveCallbacks } from '@/store'
import type { Callback }                                    from '@/store'
import { parseTs }                                          from '@/components/Sidebar/utils'
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

// Mythic sleep_info formats: "60", "10s", "2m", "1h", "60 10" (interval jitter%)
function parseSleepSeconds(raw: string): number {
  if (!raw || raw === '—') return 0
  const first = raw.trim().toLowerCase().split(/\s+/)[0]
  if (first.endsWith('h')) return parseFloat(first) * 3600
  if (first.endsWith('m')) return parseFloat(first) * 60
  if (first.endsWith('s')) return parseFloat(first)
  const n = parseFloat(first)
  return isNaN(n) ? 0 : n
}

function isLateCheckin(cb: Callback): boolean {
  const sleepSecs = parseSleepSeconds(cb.sleep_info)
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

function NetworkTopology({ callbacks, selectedId }: { callbacks: Callback[]; selectedId: number | null }) {
  const visible = callbacks.slice(0, 6)
  const total   = visible.length

  // Collect unique protocols for legend
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
    <svg className={styles.netSvg} viewBox="0 0 244 170">

      {/* ── C2 hub ── */}
      <circle
        cx={C2_X} cy={C2_Y} r={C2_R}
        fill="var(--topo-c2-bg)"
        stroke="var(--crimson-500)"
        strokeWidth="1.5"
      />
      <text x={C2_X} y={C2_Y + 3} textAnchor="middle" fontFamily="monospace" fontSize="6.5" fill="var(--topo-text-accent)">
        C2
      </text>

      {/* ── Agent nodes ── */}
      {visible.map((cb, i) => {
        const angle = (i / Math.max(total, 1)) * Math.PI * 1.35 + Math.PI * (-0.175)
        const r     = 66
        const nx    = C2_X + Math.cos(angle) * r
        const ny    = 100  + Math.sin(angle) * 36

        const c2name  = cb.callbackc2profiles[0]?.c2profile.name ?? 'unknown'
        const proto   = protocolInfo(c2name)
        const alive   = cb.active
        const isSel   = cb.id === selectedId
        const late    = alive && isLateCheckin(cb)

        // Dead connection: very sparse dash — visually "broken"
        const lineColor   = !alive ? 'var(--topo-dead-line)' : proto.color
        const lineDash    = !alive ? '3 3' : late ? '2 8' : proto.dash
        const lineWidth   = isSel ? 1.8 : 1
        const lineOpacity = alive ? (late ? 0.35 : 0.75) : 0.4

        // Midpoint for protocol label
        const mx = (C2_X + nx) / 2
        const my = (C2_Y + ny) / 2 - 4

        return (
          <g key={cb.id}>
            {/* Connection line */}
            <line
              x1={C2_X} y1={C2_Y + C2_R}
              x2={nx}   y2={ny - 9}
              stroke={lineColor}
              strokeWidth={lineWidth}
              strokeDasharray={lineDash}
              opacity={lineOpacity}
            />

            {/* Protocol label on the line */}
            {alive && (
              <g>
                <rect
                  x={mx - 9} y={my - 6}
                  width={18} height={9}
                  rx="1"
                  fill="var(--topo-label-bg)"
                />
                <text
                  x={mx} y={my + 1}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontSize="5.5"
                  fontWeight="bold"
                  fill={lineColor}
                >
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

            {/* Live pulse dot — hidden when late (no active connection) */}
            {alive && !late && (
              <circle
                cx={nx + 6.5} cy={ny - 6.5} r="2.5"
                fill="var(--status-alive)"
                opacity="0.9"
              />
            )}

            {/* Hostname */}
            <text
              x={nx} y={ny + 19}
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

      {callbacks.length === 0 && (
        <text x={C2_X} y="95" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="var(--topo-text-info)">
          no agents
        </text>
      )}

      {/* ── Protocol legend ── */}
      {legendProtos.length > 0 && (
        <g transform="translate(6, 150)">
          {legendProtos.map((p, i) => (
            <g key={p.short} transform={`translate(${i * 52}, 0)`}>
              <line x1="0" y1="5" x2="12" y2="5"
                stroke={p.color}
                strokeWidth="1.5"
                strokeDasharray={p.dash}
              />
              <text x="15" y="8" fontFamily="monospace" fontSize="6" fill={p.color}>
                {p.short}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

// ── Main panel ────────────────────────────────────────

export function RightPanel() {
  const aliveCallbacks     = useAliveCallbacks()       // active:true only — for stats
  const currentTasks       = useStore((s) => s.currentTasks)
  const selectedCallbackId = useStore((s) => s.selectedCallbackId)
  const selected           = useSelectedCallback()
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
        <NetworkTopology callbacks={allCallbacks} selectedId={selectedCallbackId} />
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
                ['Sleep',   selected.sleep_info || '—'],
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
