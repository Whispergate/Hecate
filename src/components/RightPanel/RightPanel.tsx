/* ═══════════════════════════════════════════════════
   hecate/src/components/RightPanel/RightPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useQuery }                                    from '@apollo/client'
import { GET_OPERATIONS }                              from '@/apollo/operations'
import { useStore, useSelectedCallback, useAliveCallbacks } from '@/store'
import styles from './RightPanel.module.css'

export function RightPanel() {
  const allCallbacks      = useStore((s) => s.callbacks)
  const currentTasks      = useStore((s) => s.currentTasks)
  const selectedCallbackId = useStore((s) => s.selectedCallbackId)
  const aliveCallbacks    = useAliveCallbacks()
  const selected          = useSelectedCallback()
  const activeOp          = useStore((s) => s.activeOperation)

  const { data: opData } = useQuery(GET_OPERATIONS, {
    skip: !activeOp,
    fetchPolicy: 'cache-first',
  })

  // Count operators from the operation
  const operatorCount = opData?.operation?.[0]
    ? 1  // Will expand when we add operator list to operations query
    : 1

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
        <svg className={styles.netSvg} viewBox="0 0 244 148">
          {/* C2 hub */}
          <circle cx="122" cy="30" r="12" fill="#2a0808" stroke="var(--crimson-500)" strokeWidth="1.5" />
          <text x="122" y="34" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="var(--crimson-300)">C2</text>

          {allCallbacks.slice(0, 6).map((cb, i) => {
            const total = Math.min(allCallbacks.length, 6)
            const angle = (i / total) * Math.PI * 1.4 + Math.PI * (-0.2)
            const r = 72
            const x = 122 + Math.cos(angle) * r
            const y = 85  + Math.sin(angle) * 38
            const alive = cb.active
            const isSelected = cb.id === selectedCallbackId

            return (
              <g key={cb.id}>
                <line
                  x1="122" y1="42"
                  x2={x} y2={y - 9}
                  stroke={alive ? 'rgba(208,56,56,0.5)' : 'rgba(80,20,20,0.3)'}
                  strokeWidth={isSelected ? 1.5 : 0.8}
                  strokeDasharray={alive ? undefined : '3 3'}
                />
                <circle
                  cx={x} cy={y} r="9"
                  fill={isSelected ? '#3a0808' : '#1a0606'}
                  stroke={alive ? 'var(--crimson-500)' : '#3a1818'}
                  strokeWidth={isSelected ? 1.5 : 1}
                />
                {alive && (
                  <circle cx={x + 7} cy={y - 7} r="2.5"
                    fill="var(--status-alive)"
                    opacity="0.9"
                  />
                )}
                <text
                  x={x} y={y + 20}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontSize="6"
                  fill="var(--bone-600)"
                >
                  {cb.host.slice(0, 9)}
                </text>
              </g>
            )
          })}

          {allCallbacks.length === 0 && (
            <text x="122" y="90" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="var(--bone-800)">
              no agents
            </text>
          )}
        </svg>
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
              { label: 'Completed', count: currentTasks.filter(t => t.completed).length,           color: 'var(--status-ok-text)' },
              { label: 'Running',   count: currentTasks.filter(t => !t.completed && t.status !== 'error').length, color: 'var(--crimson-300)' },
              { label: 'Errors',    count: errorCount,                                             color: 'var(--status-err-text)' },
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
