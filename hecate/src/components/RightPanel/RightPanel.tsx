/* ═══════════════════════════════════════════════════
   hecate/src/components/RightPanel/RightPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useStore, useSelectedCallback, useAliveCallbacks } from '@/store'
import styles from './RightPanel.module.css'

export function RightPanel() {
  const allCallbacks   = useStore((s) => s.callbacks)
  const aliveCallbacks = useAliveCallbacks()
  const selected       = useSelectedCallback()

  const totalTasks = 0 // TODO: wire from task subscription count
  const operators  = 1 // TODO: wire from operation query

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
            <div className={styles.statLbl}>Total callbacks</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statVal}>{operators}</div>
            <div className={styles.statLbl}>Operators</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statVal} ${styles.warn}`}>{totalTasks}</div>
            <div className={styles.statLbl}>Tasks today</div>
          </div>
        </div>
      </div>

      {/* ── Mini network graph ── */}
      <div className={styles.section}>
        <div className="sec-label">Network topology</div>
        <svg className={styles.netSvg} viewBox="0 0 244 138">
          {/* C2 node */}
          <circle cx="122" cy="36" r="11" fill="#2a0a0a" stroke="var(--crimson-600)" strokeWidth="1.2" />
          <text x="122" y="40" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="var(--crimson-400)">C2</text>

          {/* Lines to agents */}
          {allCallbacks.slice(0, 5).map((cb, i) => {
            const angle = (i / Math.max(allCallbacks.length, 1)) * Math.PI + Math.PI * 0.1
            const x = 122 + Math.cos(angle) * 80
            const y = 95  + Math.sin(angle) * 30
            const alive = Date.now() - new Date(cb.last_checkin).getTime() < 60_000
            return (
              <g key={cb.id}>
                <line
                  x1="122" y1="47"
                  x2={x} y2={y - 8}
                  stroke={alive ? 'rgba(139,26,26,0.45)' : 'rgba(80,20,20,0.3)'}
                  strokeWidth="0.8"
                  strokeDasharray={alive ? undefined : '3 3'}
                />
                <circle
                  cx={x} cy={y}
                  r="8"
                  fill="#1a0808"
                  stroke={alive ? 'var(--crimson-700)' : '#3a1818'}
                  strokeWidth="1"
                />
                <text
                  x={x} y={y + 18}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontSize="6"
                  fill="var(--bone-800)"
                >
                  {cb.host.slice(0, 8)}
                </text>
              </g>
            )
          })}

          {/* Placeholder when no callbacks */}
          {allCallbacks.length === 0 && (
            <text x="122" y="95" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="var(--bone-800)">
              no agents
            </text>
          )}
        </svg>
      </div>

      {/* ── Selected callback processes (placeholder) ── */}
      {selected && (
        <div className={styles.section}>
          <div className="sec-label">Agent info</div>
          <table className={styles.infoTable}>
            <tbody>
              {[
                ['Arch',    selected.architecture],
                ['Domain',  selected.domain || '—'],
                ['PID',     String(selected.pid)],
                ['Agent',   selected.payload.payloadtype.name],
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

      {/* ── MITRE tags (static for now — wire from task ATT&CK mappings) ── */}
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
