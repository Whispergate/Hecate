/* ═══════════════════════════════════════════════════
   hecate/src/components/Sidebar/Sidebar.tsx
   ═══════════════════════════════════════════════════ */

import { useStore, useSelectedCallback } from '@/store'
import { integrityLabel, timeSince, parseTs } from './utils'
import styles from './Sidebar.module.css'

export function Sidebar() {
  const { selectedCallbackId, setSelectedCallbackId, callbacks } = useStore()
  const callbackAliveMs       = useStore((s) => s.settings.callbackAliveMs)
  const callbackIdleMs        = useStore((s) => s.settings.callbackIdleMs)
  const showCallbackDisplayId = useStore((s) => s.settings.showCallbackDisplayId)

  const selected = useSelectedCallback()

  return (
    <aside className={styles.sidebar}>
      {/* ── Callback list ── */}
      <div className={styles.section}>
        <div className="sec-label">
          Active callbacks ({callbacks.length})
        </div>

        {callbacks.length === 0 && (
          <div className={styles.empty}>No callbacks yet</div>
        )}

        {[...callbacks]
          .map((cb) => {
            const elapsed = Date.now() - parseTs(cb.last_checkin).getTime()
            return { cb, elapsed }
          })
          .sort((a, b) => {
            const rank = (e: number) => e < callbackAliveMs ? 0 : e < callbackIdleMs ? 1 : 2
            const dr = rank(a.elapsed) - rank(b.elapsed)
            return dr !== 0 ? dr : a.cb.id - b.cb.id
          })
          .map(({ cb, elapsed }) => {
          const alive = elapsed < callbackAliveMs
          const idle  = !alive && elapsed < callbackIdleMs
          const statusClass = alive ? styles.alive : idle ? styles.idle : styles.dead

          return (
            <div
              key={cb.id}
              className={`${styles.callbackItem} ${cb.id === selectedCallbackId ? styles.active : ''}`}
              onClick={() => setSelectedCallbackId(cb.id)}
            >
              <span className={`${styles.statusDot} ${statusClass}`} />
              <div className={styles.cbHost}>
                {showCallbackDisplayId && <span className={styles.cbId}>#{cb.display_id} </span>}
                {cb.host}
              </div>
              <div className={styles.cbMeta}>
                <span>{cb.payload.payloadtype.name} · {cb.os}</span>
                <span>{timeSince(cb.last_checkin)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Selected callback detail ── */}
      {selected && (
        <div className={`${styles.section} ${styles.detail}`}>
          <div className="sec-label">{selected.host}</div>

          {[
            ['Integrity', integrityLabel(selected.integrity_level)],
            ['User',      selected.user || '—'],
            ['Domain',    selected.domain || '—'],
            ['PID',       String(selected.pid)],
            ['Sleep',     selected.sleep_info || '—'],
            ['IP',        selected.ip],
            ['OS',        selected.os],
            ['Agent',     selected.payload.payloadtype.name],
            ['C2',        selected.callbackc2profiles[0]?.c2profile.name ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className={styles.infoRow}>
              <span className={styles.infoKey}>{k}</span>
              <span
                className={`${styles.infoVal} ${k === 'Integrity' && selected.integrity_level >= 3 ? styles.hiVal : ''}`}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
