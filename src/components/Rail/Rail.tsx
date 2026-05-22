/* ═══════════════════════════════════════════════════
   hecate/src/components/Rail/Rail.tsx
   ═══════════════════════════════════════════════════ */

import { useStore } from '@/store'
import type { HecateStore } from '@/store'
import { useMemo } from 'react'
import styles from './Rail.module.css'

const SETTINGS_ICON = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="5"  cy="4"  r="1.3" />
    <circle cx="10" cy="8"  r="1.3" />
    <circle cx="5"  cy="12" r="1.3" />
    <path d="M7 4h7M2 8h6M7 12h7" />
    <path d="M2 4h1M14 8h-2M2 12h1" />
  </svg>
)

type RailView = HecateStore['activeRailView']

const ITEMS: { id: RailView; title: string; icon: React.ReactNode }[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="4" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="8" width="5" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: 'callbacks',
    title: 'Callbacks',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="2" y="3" width="12" height="9" rx="1.5" />
        <path d="M5 12v2M11 12v2M3 14h10" />
      </svg>
    ),
  },
  {
    id: 'health',
    title: 'Beacon Health',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 8.5h3l1.5-4 2.5 7 1.8-5 1.2 2h3" />
      </svg>
    ),
  },
  {
    id: 'payloads',
    title: 'Payloads',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z" />
        <path d="M8 2V14M2 5.5L14 5.5" />
      </svg>
    ),
  },
  {
    id: 'services',
    title: 'Services',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
      </svg>
    ),
  },
  {
    id: 'proxies',
    title: 'Proxies & Pivots',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="1" y="6" width="4" height="4" rx="0.8" />
        <rect x="11" y="6" width="4" height="4" rx="0.8" />
        <path d="M5 8h2M9 8h2" />
        <circle cx="8" cy="8" r="1.5" />
      </svg>
    ),
  },
  {
    id: 'credentials',
    title: 'Credentials',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="6.5" cy="8.5" r="3.5" />
        <path d="M9.5 8.5H14M12 7v3" />
      </svg>
    ),
  },
  {
    id: 'files',
    title: 'File Browser',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M2 4a1 1 0 011-1h3.586a1 1 0 01.707.293L8 4h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'operations',
    title: 'Operations',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="5" r="2.5" />
        <path d="M3 13c0-2.76 2.24-5 5-5s5 2.24 5 5" />
        <path d="M11 3.5l1.5 1.5-1.5 1.5" />
        <path d="M13 5h-1.5" />
      </svg>
    ),
  },
  {
    id: 'timeline',
    title: 'Attack Timeline',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M2 8h12" />
        <circle cx="4"  cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="8"  cy="8" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <path d="M4 5v1.2M8 4v2.2M12 6v0.2" />
      </svg>
    ),
  },
  {
    id: 'replay',
    title: 'Session Replay',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M6.5 5.4l4.2 2.6-4.2 2.6z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'eventing',
    title: 'Eventing Workflows',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="3.5" cy="3.5" r="1.5" />
        <circle cx="3.5" cy="12.5" r="1.5" />
        <circle cx="12.5" cy="8" r="1.5" />
        <path d="M5 3.5h3M5 12.5h3" />
        <path d="M8 3.5 Q10.5 5 11.2 7.2" />
        <path d="M8 12.5 Q10.5 11 11.2 8.8" />
      </svg>
    ),
  },
  {
    id: 'attack',
    title: 'ATT&CK Matrix',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    id: 'logs',
    title: 'Event Log',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M3 4h10M3 8h7M3 12h5" />
      </svg>
    ),
  },
  {
    id: 'report',
    title: 'Report Builder',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M3 2h7l3 3v9H3V2z" />
        <path d="M10 2v3h3" />
        <path d="M5 7h6M5 10h4" />
      </svg>
    ),
  },
]

export function Rail() {
  const { activeRailView, setActiveRailView, isSettingsOpen, setSettingsOpen } = useStore()
  const unresolvedWarnings  = useStore((s) => s.unresolvedWarnings)
  const activeCallbackPorts = useStore((s) => s.activeCallbackPorts)
  const activePortCount = useMemo(() => activeCallbackPorts.length, [activeCallbackPorts])

  return (
    <nav className={styles.rail}>
      {ITEMS.map((item, idx) => (
        <>
          {idx === 5 && <div key="sep" className={styles.sep} />}
          <div key={item.id} className={styles.btnWrap}>
            <button
              className={`${styles.btn} ${activeRailView === item.id ? styles.active : ''}`}
              title={item.title}
              onClick={() => setActiveRailView(item.id)}
            >
              {item.icon}
            </button>
            {item.id === 'logs' && unresolvedWarnings > 0 && (
              <span className={styles.badge}>{unresolvedWarnings > 99 ? '99+' : unresolvedWarnings}</span>
            )}
            {item.id === 'proxies' && activePortCount > 0 && (
              <span className={`${styles.badge} ${styles.badgeProxy}`}>{activePortCount}</span>
            )}
          </div>
        </>
      ))}

      {/* Push settings to bottom */}
      <div className={styles.spacer} />
      <div className={styles.sep} />
      <button
        className={`${styles.btn} ${isSettingsOpen ? styles.active : ''}`}
        title="Settings"
        onClick={() => setSettingsOpen(!isSettingsOpen)}
      >
        {SETTINGS_ICON}
      </button>
    </nav>
  )
}
