/* ═══════════════════════════════════════════════════
   src/components/ProxiesPanel/ProxiesPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useState }              from 'react'
import { useMutation, useSubscription } from '@apollo/client'
import { CREATE_TASK, SUB_ALL_CALLBACKS } from '@/apollo/operations'
import { useStore, useAliveCallbacks }   from '@/store'
import type { Callback, CallbackPort }   from '@/store'
import { PivotGraph, isLateCheckin }      from './PivotGraph'
import styles                            from './ProxiesPanel.module.css'

function fmtBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function ProxiesPanel() {
  const ports               = useStore((s) => s.activeCallbackPorts)
  const activeOp            = useStore((s) => s.activeOperation)
  const aliveCallbacks      = useAliveCallbacks()
  const selectedCallbackId  = useStore((s) => s.selectedCallbackId)
  const callbackAnnotations = useStore((s) => s.callbackAnnotations)
  const setSelectedCallbackId = useStore((s) => s.setSelectedCallbackId)
  const setActiveRailView   = useStore((s) => s.setActiveRailView)

  // All callbacks (including dead) for the pivot graph
  const { data: allCbData } = useSubscription(SUB_ALL_CALLBACKS, {
    variables: { operation_id: activeOp?.id ?? 0 },
    skip: !activeOp,
  })
  const allCallbacks: Callback[] = allCbData?.callback ?? aliveCallbacks

  const [graphAliveOnly, setGraphAliveOnly] = useState(false)
  const graphCallbacks = graphAliveOnly ? allCallbacks.filter(cb => cb.active && !isLateCheckin(cb)) : allCallbacks

  const [stoppingIds, setStoppingIds] = useState<Set<number>>(new Set())
  const [stopError,   setStopError]   = useState<string | null>(null)

  const [createTask] = useMutation(CREATE_TASK)

  const socks = ports.filter(p => p.port_type === 'socks')
  const rpfwd = ports.filter(p => p.port_type === 'rpfwd')

  async function handleStop(p: CallbackPort) {
    const isSocks = p.port_type === 'socks'
    const cmd    = isSocks ? 'socks' : 'rpfwd'
    const params = isSocks
      ? JSON.stringify({ action: 'stop', port: p.local_port })
      : JSON.stringify({ action: 'stop', local_port: p.local_port })

    setStoppingIds(s => new Set([...s, p.id]))
    setStopError(null)
    try {
      const res = await createTask({
        variables: {
          callback_id:      p.callback.display_id,
          command:          cmd,
          params,
          tasking_location: 'modal',
          original_params:  params,
        },
      })
      if (res?.data?.createTask?.status === 'error') {
        setStopError(res.data.createTask.error ?? 'Stop task failed')
      }
    } catch (e: unknown) {
      setStopError(e instanceof Error ? e.message : 'Stop task failed')
    } finally {
      setStoppingIds(s => { const n = new Set(s); n.delete(p.id); return n })
    }
  }

  function onNavigate(id: number) {
    setSelectedCallbackId(id)
    setActiveRailView('callbacks')
  }

  return (
    <div className={styles.panel}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <span className={styles.title}>Pivot Map</span>
        {ports.length > 0 && (
          <span className={styles.activeBadge}>{ports.length} active</span>
        )}
      </div>

      {stopError && (
        <div className={styles.errBar}>
          <span>{stopError}</span>
          <button className={styles.errDismiss} onClick={() => setStopError(null)}>✕</button>
        </div>
      )}

      {/* ── Split: table left, graph right ── */}
      <div className={styles.split}>

        {/* ── Left pane: proxy tables ── */}
        <div className={styles.listPane}>
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
              <div className={styles.emptyTitle}>No active proxies</div>
              <div className={styles.emptySub}>SOCKS proxies and reverse port forwards appear here when started.</div>
            </div>
          ) : (
            <>
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
                      <span></span>
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
                        <button
                          className={styles.stopBtn}
                          disabled={stoppingIds.has(p.id)}
                          onClick={() => handleStop(p)}
                        >
                          {stoppingIds.has(p.id) ? '…' : '■ Stop'}
                        </button>
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
                      <span></span>
                    </div>
                    {rpfwd.map(p => (
                      <div key={p.id} className={`${styles.row} ${styles.rowFwd}`}>
                        <span className={styles.host}>
                          {p.callback.host}
                          <span className={styles.displayId}>#{p.callback.display_id}</span>
                        </span>
                        <span className={styles.agent}>{p.callback.payload.payloadtype.name}</span>
                        <span className={styles.port}>:{p.local_port}</span>
                        <span className={styles.target}>{p.remote_ip}:{p.remote_port}</span>
                        <span className={styles.bytes}>{fmtBytes(p.bytes_sent)}</span>
                        <span className={styles.bytes}>{fmtBytes(p.bytes_received)}</span>
                        <span className={styles.taskId}>#{p.task.display_id}</span>
                        <button
                          className={styles.stopBtn}
                          disabled={stoppingIds.has(p.id)}
                          onClick={() => handleStop(p)}
                        >
                          {stoppingIds.has(p.id) ? '…' : '■ Stop'}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Right pane: pivot graph ── */}
        <div className={styles.graphPane}>
          <label className={styles.graphFilter}>
            <input
              type="checkbox"
              className={styles.graphFilterCheck}
              checked={graphAliveOnly}
              onChange={e => setGraphAliveOnly(e.target.checked)}
            />
            alive only
          </label>
          <PivotGraph
            callbacks={graphCallbacks}
            ports={ports}
            onNavigate={onNavigate}
            annotations={callbackAnnotations}
            selectedId={selectedCallbackId}
          />
        </div>

      </div>
    </div>
  )
}
