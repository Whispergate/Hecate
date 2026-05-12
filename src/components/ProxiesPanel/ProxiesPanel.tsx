/* ═══════════════════════════════════════════════════
   src/components/ProxiesPanel/ProxiesPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useStore } from '@/store'
import styles from './ProxiesPanel.module.css'

function fmtBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function ProxiesPanel() {
  const ports = useStore((s) => s.activeCallbackPorts)

  const socks = ports.filter(p => p.port_type === 'socks')
  const rpfwd = ports.filter(p => p.port_type === 'rpfwd')

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Proxies &amp; Tunnels</span>
        {ports.length > 0 && (
          <span className={styles.activeBadge}>{ports.length} active</span>
        )}
      </div>

      {ports.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <rect x="2" y="12" width="8" height="8" rx="1.5" />
              <rect x="22" y="12" width="8" height="8" rx="1.5" />
              <path d="M10 16h4M18 16h4" />
              <circle cx="16" cy="16" r="3" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>No active proxies or tunnels</div>
          <div className={styles.emptySub}>SOCKS proxies and reverse port forwards will appear here when started by an agent.</div>
        </div>
      ) : (
        <div className={styles.body}>
          {socks.length > 0 && (
            <section>
              <div className={styles.sectionLabel}>SOCKS Proxies</div>
              <div className={styles.table}>
                <div className={`${styles.row} ${styles.thead}`}>
                  <span>Callback</span>
                  <span>Agent</span>
                  <span>Local Port</span>
                  <span>Bytes ↑</span>
                  <span>Bytes ↓</span>
                  <span>Task</span>
                </div>
                {socks.map(p => (
                  <div key={p.id} className={styles.row}>
                    <span className={styles.host}>
                      {p.callback.host}
                      <span className={styles.displayId}>#{p.callback.display_id}</span>
                    </span>
                    <span className={styles.agent}>{p.callback.payload.payloadtype.name}</span>
                    <span className={styles.port}>:{p.local_port}</span>
                    <span className={styles.bytes}>{fmtBytes(p.bytes_sent)}</span>
                    <span className={styles.bytes}>{fmtBytes(p.bytes_received)}</span>
                    <span className={styles.taskId}>#{p.task.display_id}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {rpfwd.length > 0 && (
            <section>
              <div className={styles.sectionLabel}>Reverse Port Forwards</div>
              <div className={styles.table}>
                <div className={`${styles.row} ${styles.theadFwd}`}>
                  <span>Callback</span>
                  <span>Agent</span>
                  <span>Local Port</span>
                  <span>Target</span>
                  <span>Bytes ↑</span>
                  <span>Bytes ↓</span>
                  <span>Task</span>
                </div>
                {rpfwd.map(p => (
                  <div key={p.id} className={`${styles.row} ${styles.rowFwd}`}>
                    <span className={styles.host}>
                      {p.callback.host}
                      <span className={styles.displayId}>#{p.callback.display_id}</span>
                    </span>
                    <span className={styles.agent}>{p.callback.payload.payloadtype.name}</span>
                    <span className={styles.port}>:{p.local_port}</span>
                    <span className={styles.target}>
                      {p.remote_ip}:{p.remote_port}
                    </span>
                    <span className={styles.bytes}>{fmtBytes(p.bytes_sent)}</span>
                    <span className={styles.bytes}>{fmtBytes(p.bytes_received)}</span>
                    <span className={styles.taskId}>#{p.task.display_id}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
