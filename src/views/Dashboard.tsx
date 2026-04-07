/* ═══════════════════════════════════════════════════
   hecate/src/views/Dashboard.tsx
   ═══════════════════════════════════════════════════ */

import { Topbar }        from '@/components/Topbar/Topbar'
import { Rail }          from '@/components/Rail/Rail'
import { Sidebar }       from '@/components/Sidebar/Sidebar'
import { TaskFeed }      from '@/components/TaskFeed/TaskFeed'
import { CommandBar }    from '@/components/CommandBar/CommandBar'
import { RightPanel }    from '@/components/RightPanel/RightPanel'
import { PayloadPanel }   from '@/components/PayloadPanel/PayloadPanel'
import { ServicesPanel }  from '@/components/ServicesPanel/ServicesPanel'
import { ReportPanel }    from '@/components/ReportPanel/ReportPanel'
import { useStore, useSelectedCallback } from '@/store'
import styles from './Dashboard.module.css'

function MainHeader() {
  const cb = useSelectedCallback()
  const op = useStore((s) => s.activeOperation)

  const title = cb
    ? `${cb.host} — task feed`
    : op
    ? `${op.name} — select a callback`
    : 'no operation selected'

  const sub = cb
    ? `${cb.callbackc2profiles[0]?.c2profile.name ?? 'http'} · ${cb.ip} · ${cb.payload.payloadtype.name}`
    : 'mythic v3 · graphql · websocket'

  return (
    <div className={styles.mainHeader}>
      <div className={styles.headerLeft}>
        <div className={styles.headerTitle}>{title}</div>
        <div className={styles.headerSub}>{sub}</div>
      </div>
    </div>
  )
}

export function Dashboard() {
  const activeRailView = useStore((s) => s.activeRailView)
  const isFullPanel    = activeRailView === 'payloads' || activeRailView === 'services' || activeRailView === 'report'

  return (
    <div className={styles.root}>
      <div className={styles.stripe} />
      <Topbar />

      <div className={styles.body}>
        <Rail />

        {isFullPanel ? (
          <div className={styles.fullPanel}>
            {activeRailView === 'payloads'  && <PayloadPanel />}
            {activeRailView === 'services'  && <ServicesPanel />}
            {activeRailView === 'report'    && <ReportPanel />}
          </div>
        ) : (
          <>
            <Sidebar />
            <main className={styles.main}>
              <MainHeader />
              <TaskFeed />
              <CommandBar />
            </main>
            <RightPanel />
          </>
        )}
      </div>
    </div>
  )
}
