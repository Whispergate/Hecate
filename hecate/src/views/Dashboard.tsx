/* ═══════════════════════════════════════════════════
   hecate/src/views/Dashboard.tsx
   ═══════════════════════════════════════════════════ */

import { Topbar }      from '@/components/Topbar/Topbar'
import { Rail }        from '@/components/Rail/Rail'
import { Sidebar }     from '@/components/Sidebar/Sidebar'
import { TaskFeed }    from '@/components/TaskFeed/TaskFeed'
import { CommandBar }  from '@/components/CommandBar/CommandBar'
import { RightPanel }  from '@/components/RightPanel/RightPanel'
import styles          from './Dashboard.module.css'

export function Dashboard() {
  return (
    <div className={styles.root}>
      <div className={styles.stripe} />
      <Topbar />

      <div className={styles.body}>
        <Rail />
        <Sidebar />

        <main className={styles.main}>
          <div className={styles.mainHeader}>
            <MainHeaderContent />
          </div>
          <TaskFeed />
          <CommandBar />
        </main>

        <RightPanel />
      </div>
    </div>
  )
}

function MainHeaderContent() {
  // Imported inline to keep Dashboard.tsx clean
  const { useStore, useSelectedCallback } = require('@/store')
  const cb = useSelectedCallback()
  const op = useStore((s: any) => s.activeOperation)

  return (
    <div className={styles.headerLeft}>
      <div className={styles.headerTitle}>
        {cb ? `${cb.host} — task feed` : op ? `${op.name} — select a callback` : 'no operation selected'}
      </div>
      <div className={styles.headerSub}>
        {cb
          ? `${cb.callbackc2profiles[0]?.c2profile.name ?? 'http'} · ${cb.ip} · agent: ${cb.payload.payloadtype.name}`
          : 'mythic v3 · graphql · websocket'}
      </div>
    </div>
  )
}
