/* ═══════════════════════════════════════════════════
   src/components/OverviewPanel/OverviewPanel.tsx

   Operation overview dashboard — live stats, agent
   cards, activity feed, and breakdowns not found in
   the default Mythic UI.
   ═══════════════════════════════════════════════════ */

import { useSubscription }                            from '@apollo/client'
import { useStore }                                   from '@/store'
import type { Callback, Task }                        from '@/store'
import { SUB_ALL_CALLBACKS, SUB_RECENT_OP_TASKS }     from '@/apollo/operations'
import { parseTs, timeSince, integrityLabel }          from '@/components/Sidebar/utils'
import styles                                         from './OverviewPanel.module.css'

// ── Helpers ───────────────────────────────────────────

// Mirrors the Sidebar's thresholds exactly:
//   < 60 s  → alive   (green)
//   < 600 s → idle    (amber)
//   ≥ 600 s → dead    (grey/red)
// Also matches what SUB_CALLBACKS filters as "active".
type CheckinState = 'alive' | 'idle' | 'dead'

function checkinState(cb: Callback): CheckinState {
  const elapsed = Date.now() - parseTs(cb.last_checkin).getTime()
  if (elapsed < 60_000)  return 'alive'
  if (elapsed < 600_000) return 'idle'
  return 'dead'
}

function implantAge(ts: string): string {
  const s = (Date.now() - parseTs(ts).getTime()) / 1000
  if (s < 60)    return `${Math.floor(s)}s`
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

function ilColor(il: number): string {
  if (il >= 4) return 'var(--crimson-300)'
  if (il === 3) return 'var(--status-warn-text)'
  if (il === 2) return 'var(--bone-400)'
  return 'var(--bone-800)'
}

function taskStatusClass(t: Task): string {
  if (t.status === 'error') return styles.statusErr
  if (t.completed)          return styles.statusOk
  return styles.statusRun
}

function taskStatusGlyph(t: Task): string {
  if (t.status === 'error') return '✗'
  if (t.completed)          return '✓'
  return '⟳'
}

// ── Sub-components ────────────────────────────────────

function StatChip({ value, label, color }: { value: number | string; label: string; color?: string }) {
  return (
    <div className={styles.statChip}>
      <span className={styles.statVal} style={color ? { color } : undefined}>{value}</span>
      <span className={styles.statLbl}>{label}</span>
    </div>
  )
}

function MiniBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0
  return (
    <div className={styles.miniBarRow}>
      <span className={styles.miniBarLabel} title={label}>{label}</span>
      <div className={styles.miniBarTrack}>
        <div className={styles.miniBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.miniBarCount}>{count}</span>
    </div>
  )
}

function AgentCard({ cb, lastTask, onSelect }: { cb: Callback; lastTask: Task | undefined; onSelect: () => void }) {
  const state   = checkinState(cb)
  const c2name  = cb.callbackc2profiles[0]?.c2profile.name ?? '?'
  const il      = cb.integrity_level

  const dotCls  = state === 'alive' ? styles.dotAlive
                : state === 'idle'  ? styles.dotIdle
                :                     styles.dotDead

  return (
    <button
      className={`${styles.card} ${state === 'dead' ? styles.cardInactive : ''} ${state === 'idle' ? styles.cardLate : ''}`}
      onClick={onSelect}
    >
      {/* ── Head row ── */}
      <div className={styles.cardHead}>
        <span className={`${styles.dot} ${dotCls}`} />
        <span className={styles.cardHost}>{cb.host}</span>
        <span className={styles.cardId}>#{cb.display_id}</span>
        <span className={styles.c2Tag}>{c2name.toUpperCase().slice(0, 4)}</span>
      </div>

      {/* ── Identity ── */}
      <div className={styles.cardIdent}>
        {cb.user}{cb.domain ? ` · ${cb.domain}` : ''} · {cb.architecture || '?'}
      </div>
      <div className={styles.cardOs}>{cb.os?.split('\n')[0] || '—'}</div>

      {/* ── Meta grid ── */}
      <div className={styles.metaGrid}>
        <span className={styles.metaKey}>last</span>
        <span className={styles.metaVal}>{timeSince(cb.last_checkin)}</span>
        <span className={styles.metaKey}>age</span>
        <span className={styles.metaVal}>{implantAge(cb.init_callback)}</span>
        <span className={styles.metaKey}>sleep</span>
        <span className={styles.metaVal}>{cb.sleep_info || '—'}</span>
        <span className={styles.metaKey}>IL</span>
        <span className={styles.metaVal} style={{ color: ilColor(il) }}>
          {integrityLabel(il).toUpperCase()}
        </span>
      </div>

      {/* ── Last task ── */}
      {lastTask && (
        <div className={styles.cardLastTask}>
          <span className={styles.ltCmd}>{lastTask.command_name}</span>
          <span className={styles.ltParams}>
            {lastTask.display_params.slice(0, 28)}{lastTask.display_params.length > 28 ? '…' : ''}
          </span>
          <span className={`${styles.ltGlyph} ${taskStatusClass(lastTask)}`}>
            {taskStatusGlyph(lastTask)}
          </span>
        </div>
      )}
    </button>
  )
}

function ActivityRow({ task }: { task: Task }) {
  const ts  = parseTs(task.timestamp)
  const hms = ts.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className={`${styles.actRow} ${task.status === 'error' ? styles.actRowErr : ''}`}>
      <span className={styles.actTime}>{hms}</span>
      <span className={styles.actHost} title={task.callback.host}>{task.callback.host.slice(0, 16)}</span>
      <span className={styles.actOp}>{task.operator.username.slice(0, 12)}</span>
      <span className={styles.actCmd}>{task.command_name}</span>
      <span className={styles.actParams}>
        {task.display_params.slice(0, 44)}{task.display_params.length > 44 ? '…' : ''}
      </span>
      <span className={`${styles.actStatus} ${taskStatusClass(task)}`}>
        {task.status === 'error' ? 'error' : task.completed ? 'done' : 'running'}
      </span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────

export function OverviewPanel() {
  const op                  = useStore(s => s.activeOperation)
  const setSelectedCallback = useStore(s => s.setSelectedCallbackId)
  const setRailView         = useStore(s => s.setActiveRailView)

  const { data: cbData } = useSubscription(SUB_ALL_CALLBACKS, {
    variables: { operation_id: op?.id ?? 0 },
    skip: !op,
  })

  const { data: taskData } = useSubscription(SUB_RECENT_OP_TASKS, {
    variables: { operation_id: op?.id ?? 0, limit: 40 },
    skip: !op,
  })

  const allCallbacks: Callback[] = cbData?.callback ?? []
  const recentTasks: Task[]      = taskData?.task ?? []

  // Section membership mirrors the Sidebar exactly:
  //   alive + idle (< 600s) → "Active Agents"
  //   dead (≥ 600s)         → "Inactive"
  // Mythic's cb.active DB field is unreliable for liveness — it's only cleared on
  // an explicit kill, not on missed check-ins. Use elapsed time instead.
  //
  // Sort: quantise to 60-second buckets so a callback only moves to the front
  // once per bucket window (not on every individual beacon).
  function checkinBucket(ts: string): number {
    return Math.floor(parseTs(ts).getTime() / 60_000)
  }

  const alive = [...allCallbacks.filter(c => checkinState(c) !== 'dead')].sort((a, b) => {
    const diff = checkinBucket(b.last_checkin) - checkinBucket(a.last_checkin)
    return diff !== 0 ? diff : a.id - b.id
  })
  const dead  = [...allCallbacks.filter(c => checkinState(c) === 'dead')].sort((a, b) => a.id - b.id)
  const errors = recentTasks.filter(t => t.status === 'error').length

  // ── Breakdowns ──────────────────────────────────────

  const protoCounts = allCallbacks.reduce((acc, cb) => {
    const n = cb.callbackc2profiles[0]?.c2profile.name ?? 'unknown'
    acc[n] = (acc[n] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const maxProto = Math.max(...Object.values(protoCounts), 1)

  const osCounts = alive.reduce((acc, cb) => {
    const os = cb.os?.split(' ')[0]?.split('\n')[0] ?? 'Unknown'
    acc[os] = (acc[os] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const maxOs = Math.max(...Object.values(osCounts), 1)

  const cmdCounts = recentTasks.reduce((acc, t) => {
    acc[t.command_name] = (acc[t.command_name] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const topCmds = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxCmd  = topCmds[0]?.[1] ?? 1

  const opCounts = recentTasks.reduce((acc, t) => {
    acc[t.operator.username] = (acc[t.operator.username] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const topOps = Object.entries(opCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxOp  = topOps[0]?.[1] ?? 1

  // ── Jump to callback ─────────────────────────────────

  function jumpTo(cbId: number) {
    setSelectedCallback(cbId)
    setRailView('callbacks')
  }

  // ── Last task per callback (from recent tasks) ───────

  function lastTaskFor(cbId: number): Task | undefined {
    return recentTasks.find(t => t.callback.id === cbId)
  }

  // ── Proto colors ─────────────────────────────────────

  const PROTO_COLORS: Record<string, string> = {
    http:    'var(--proto-http)',
    https:   'var(--proto-http)',
    smb:     'var(--proto-smb)',
    tcp:     'var(--proto-tcp)',
    ws:      'var(--proto-ws)',
    websocket:'var(--proto-ws)',
    dns:     'var(--proto-dns)',
  }
  function protoColor(name: string) {
    return PROTO_COLORS[name.toLowerCase()] ?? 'var(--proto-default)'
  }

  return (
    <div className={styles.panel}>

      {/* ══ Header ══ */}
      <header className={styles.header}>
        <div className={styles.opTitle}>
          <span className={styles.opPulse} />
          <span className={styles.opName}>{op?.name ?? 'no operation'}</span>
        </div>
        <div className={styles.statsBar}>
          <StatChip value={alive.length}         label="live agents"   color="var(--status-ok-text)" />
          <div className={styles.statDivider} />
          <StatChip value={allCallbacks.length}  label="total callbacks" />
          <div className={styles.statDivider} />
          <StatChip value={recentTasks.length}   label="recent tasks" />
          <div className={styles.statDivider} />
          <StatChip
            value={errors}
            label="errors"
            color={errors > 0 ? 'var(--status-err-text)' : undefined}
          />
        </div>
      </header>

      {/* ══ Body ══ */}
      <div className={styles.body}>

        {/* ── Left: breakdowns ── */}
        <aside className={styles.leftCol}>

          {Object.keys(protoCounts).length > 0 && (
            <section className={styles.leftSection}>
              <div className="sec-label">C2 Protocols</div>
              {Object.entries(protoCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => (
                  <MiniBar key={name} label={name} count={count} max={maxProto} color={protoColor(name)} />
                ))}
            </section>
          )}

          {Object.keys(osCounts).length > 0 && (
            <section className={styles.leftSection}>
              <div className="sec-label">OS</div>
              {Object.entries(osCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([os, count]) => (
                  <MiniBar key={os} label={os} count={count} max={maxOs} color="var(--bone-600)" />
                ))}
            </section>
          )}

          {topCmds.length > 0 && (
            <section className={styles.leftSection}>
              <div className="sec-label">Top Commands</div>
              {topCmds.map(([cmd, count]) => (
                <MiniBar key={cmd} label={cmd} count={count} max={maxCmd} color="var(--crimson-400)" />
              ))}
            </section>
          )}

          {topOps.length > 0 && (
            <section className={styles.leftSection}>
              <div className="sec-label">Operators</div>
              {topOps.map(([op, count]) => (
                <MiniBar key={op} label={op} count={count} max={maxOp} color="var(--proto-ws)" />
              ))}
            </section>
          )}

          {allCallbacks.length === 0 && (
            <div className={styles.leftEmpty}>waiting for agents…</div>
          )}

        </aside>

        {/* ── Main: agent cards ── */}
        <div className={styles.mainArea}>

          {alive.length > 0 && (
            <section className={styles.cardSection}>
              <div className="sec-label">Active Agents ({alive.length})</div>
              <div className={styles.cardGrid}>
                {alive.map(cb => (
                  <AgentCard
                    key={cb.id}
                    cb={cb}
                    lastTask={lastTaskFor(cb.id)}
                    onSelect={() => jumpTo(cb.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {dead.length > 0 && (
            <section className={styles.cardSection}>
              <div className="sec-label" style={{ opacity: 0.55 }}>Inactive ({dead.length})</div>
              <div className={styles.cardGrid}>
                {dead.map(cb => (
                  <AgentCard
                    key={cb.id}
                    cb={cb}
                    lastTask={lastTaskFor(cb.id)}
                    onSelect={() => jumpTo(cb.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {allCallbacks.length === 0 && (
            <div className={styles.emptyState}>
              <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span>no callbacks yet</span>
              <span className={styles.emptySub}>waiting for agent check-ins…</span>
            </div>
          )}

        </div>
      </div>

      {/* ══ Activity Feed ══ */}
      {recentTasks.length > 0 && (
        <footer className={styles.feed}>
          <div className={styles.feedHead}>
            <span className="sec-label" style={{ marginBottom: 0, flexGrow: 0 }}>Recent Activity</span>
            <span className={styles.feedMeta}>
              last {recentTasks.length} tasks · live
            </span>
          </div>

          {/* column headers */}
          <div className={`${styles.actRow} ${styles.actHeader}`}>
            <span className={styles.actTime}>time</span>
            <span className={styles.actHost}>host</span>
            <span className={styles.actOp}>operator</span>
            <span className={styles.actCmd}>command</span>
            <span className={styles.actParams}>params</span>
            <span className={styles.actStatus}>status</span>
          </div>

          <div className={styles.feedList}>
            {recentTasks.map(t => <ActivityRow key={t.id} task={t} />)}
          </div>
        </footer>
      )}

    </div>
  )
}
