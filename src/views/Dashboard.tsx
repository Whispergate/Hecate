/* ═══════════════════════════════════════════════════
   hecate/src/views/Dashboard.tsx
   ═══════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react'
import { useSubscription } from '@apollo/client'
import { Topbar }        from '@/components/Topbar/Topbar'
import { Rail }          from '@/components/Rail/Rail'
import { Sidebar }       from '@/components/Sidebar/Sidebar'
import { TaskFeed }      from '@/components/TaskFeed/TaskFeed'
import { CommandBar }    from '@/components/CommandBar/CommandBar'
import { RightPanel }    from '@/components/RightPanel/RightPanel'
import { PayloadPanel }   from '@/components/PayloadPanel/PayloadPanel'
import { ServicesPanel }  from '@/components/ServicesPanel/ServicesPanel'
import { ReportPanel }    from '@/components/ReportPanel/ReportPanel'
import { FilesPanel }     from '@/components/FilesPanel/FilesPanel'
import { OverviewPanel }     from '@/components/OverviewPanel/OverviewPanel'
import { OperationsPanel }     from '@/components/OperationsPanel/OperationsPanel'
import { CredentialsPanel }   from '@/components/CredentialsPanel/CredentialsPanel'
import { EventLogPanel }      from '@/components/EventLogPanel/EventLogPanel'
import { ProxiesPanel }            from '@/components/ProxiesPanel/ProxiesPanel'
import { TimelinePanel }          from '@/components/TimelinePanel/TimelinePanel'
import { CallbackToastContainer }  from '@/components/Toast/CallbackToast'
import { ProxyToastContainer }     from '@/components/Toast/ProxyToast'
import { SettingsPanel }         from '@/components/SettingsPanel/SettingsPanel'
import { SUB_CALLBACKS, SUB_OPERATION_ALERT_COUNT, SUB_CALLBACK_PORTS } from '@/apollo/operations'
import { parseTs }       from '@/components/Sidebar/utils'
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

function useCallbackSubscription() {
  // Use selectors — without them, every store mutation (setCurrentTasks, etc.)
  // re-renders Dashboard, which re-renders all children and loops their effects.
  const activeOperation  = useStore((s) => s.activeOperation)
  const callbacks        = useStore((s) => s.callbacks)
  const setCallbacks     = useStore((s) => s.setCallbacks)
  const addToast         = useStore((s) => s.addToast)
  const toastsEnabled    = useStore((s) => s.settings.toastsEnabled)
  const opSelectedTimeRef = useRef<number>(0)
  const toastedIdsRef     = useRef<Set<number>>(new Set())

  // Reset tracking when operation changes
  useEffect(() => {
    opSelectedTimeRef.current = Date.now()
    toastedIdsRef.current     = new Set()
  }, [activeOperation?.id])

  // Detect new callbacks: init_callback after we joined the operation
  useEffect(() => {
    for (const cb of callbacks) {
      if (toastedIdsRef.current.has(cb.id)) continue
      const initTime = parseTs(cb.init_callback).getTime()
      if (initTime > opSelectedTimeRef.current && toastsEnabled) {
        toastedIdsRef.current.add(cb.id)
        addToast({
          callbackId: cb.id,
          display_id: cb.display_id,
          host:       cb.host,
          user:       cb.user || 'unknown',
          agent:      cb.payload?.payloadtype?.name ?? 'unknown',
        })
      }
    }
  }, [callbacks])

  useSubscription(SUB_CALLBACKS, {
    variables: { operation_id: activeOperation?.id ?? 0 },
    skip:      !activeOperation,
    onData: ({ data }) => {
      if (data.data?.callback) setCallbacks(data.data.callback)
    },
  })
}

function useCallbackPortsSubscription() {
  const activeOperation        = useStore((s) => s.activeOperation)
  const setActiveCallbackPorts = useStore((s) => s.setActiveCallbackPorts)
  const addProxyToast          = useStore((s) => s.addProxyToast)

  const seenIdsRef    = useRef<Set<number>>(new Set())
  const firstLoadDone = useRef(false)

  useEffect(() => {
    seenIdsRef.current = new Set()
    firstLoadDone.current = false
  }, [activeOperation?.id])

  useSubscription(SUB_CALLBACK_PORTS, {
    variables: { operation_id: activeOperation?.id ?? 0 },
    skip:      !activeOperation,
    onData: ({ data }) => {
      const ports = data.data?.callbackport ?? []
      setActiveCallbackPorts(ports)

      if (!firstLoadDone.current) {
        for (const p of ports) seenIdsRef.current.add(p.id)
        firstLoadDone.current = true
        return
      }

      for (const p of ports) {
        if (!seenIdsRef.current.has(p.id)) {
          seenIdsRef.current.add(p.id)
          addProxyToast({
            portId:            p.id,
            portType:          p.port_type,
            localPort:         p.local_port,
            remoteIp:          p.remote_ip,
            remotePort:        p.remote_port,
            callbackHost:      p.callback.host,
            callbackDisplayId: p.callback.display_id,
            agent:             p.callback.payload.payloadtype.name,
          })
        }
      }
    },
  })
}

function useWarningBadge() {
  const setUnresolvedWarnings = useStore((s) => s.setUnresolvedWarnings)
  const activeOperation       = useStore((s) => s.activeOperation)

  useSubscription(SUB_OPERATION_ALERT_COUNT, {
    skip: !activeOperation,
    onData: ({ data }) => {
      const ops: Array<{ id: number; alert_count: number }> = data.data?.operation_stream ?? []
      const match = ops.find(o => o.id === activeOperation?.id)
      if (match != null) setUnresolvedWarnings(match.alert_count)
    },
  })
}

export function Dashboard() {
  useCallbackSubscription()
  useCallbackPortsSubscription()
  useWarningBadge()

  const activeRailView = useStore((s) => s.activeRailView)
  const isFullPanel    = activeRailView === 'overview' || activeRailView === 'payloads' || activeRailView === 'services' || activeRailView === 'proxies' || activeRailView === 'report' || activeRailView === 'files' || activeRailView === 'operations' || activeRailView === 'credentials' || activeRailView === 'logs' || activeRailView === 'timeline'

  return (
    <div className={styles.root}>
      <div className={styles.stripe} />
      <Topbar />
      <CallbackToastContainer />
      <ProxyToastContainer />
      <SettingsPanel />

      <div className={styles.body}>
        <Rail />

        {isFullPanel ? (
          <div className={styles.fullPanel}>
            {activeRailView === 'overview'  && <OverviewPanel />}
            {activeRailView === 'payloads'  && <PayloadPanel />}
            {activeRailView === 'services'  && <ServicesPanel />}
            {activeRailView === 'proxies'   && <ProxiesPanel />}
            {activeRailView === 'report'    && <ReportPanel />}
            {activeRailView === 'files'       && <FilesPanel />}
            {activeRailView === 'operations'    && <OperationsPanel />}
            {activeRailView === 'credentials'  && <CredentialsPanel />}
            {activeRailView === 'logs'         && <EventLogPanel />}
            {activeRailView === 'timeline'     && <TimelinePanel />}
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
