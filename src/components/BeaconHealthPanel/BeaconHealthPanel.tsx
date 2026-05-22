/* ═══════════════════════════════════════════════════
   src/components/BeaconHealthPanel/BeaconHealthPanel.tsx

   Beacon Health Monitor — fleet-wide check-in health.
   Surfaces overdue / late / dead agents, expected vs actual
   check-in cadence, observed jitter, and predicted next check-in.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useSubscription }                      from '@apollo/client'
import { SUB_ALL_CALLBACKS }                    from '@/apollo/operations'
import { useStore }                             from '@/store'
import type { Callback }                        from '@/store'
import { parseTs, timeSince, parseSleepNumbers } from '@/components/Sidebar/utils'
import { agentColor }                           from '@/agentColor'
import styles                                   from './BeaconHealthPanel.module.css'

// ── Types & constants ─────────────────────────────────

type Health = 'healthy' | 'overdue' | 'late' | 'dead'

const HEALTH_META: Record<Health, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'var(--status-alive)' },
  overdue: { label: 'Overdue', color: 'var(--crimson-300)' },
  late:    { label: 'Late',    color: 'var(--crimson-600)' },
  dead:    { label: 'Dead',    color: 'var(--bone-700)'    },
}
const HEALTH_ORDER: Health[]              = ['healthy', 'overdue', 'late', 'dead']
const HEALTH_RANK:  Record<Health, number> = { dead: 0, late: 1, overdue: 2, healthy: 3 }

// Plain-language criteria for the legend (see health-tier logic below).
const LEGEND: [Health, string][] = [
  ['healthy', 'checked in within its expected interval (+5 min grace)'],
  ['overdue', 'missed its window — up to ~3× the interval late'],
  ['late',    'over 3× the interval without checking in'],
  ['dead',    'marked inactive by Mythic'],
]

const GRACE_SEC   = 300   // slack beyond the expected cadence before "overdue"
const MAX_ROWS    = 300   // rendered-row cap (scales to large operations)
const HISTORY_CAP = 40    // observed check-ins kept per callback
const STRIP_GAPS  = 14    // gaps drawn in the cadence strip

interface BeaconStat {
  cb:          Callback
  intervalSec: number
  jitterPct:   number
  elapsedSec:  number
  effBand:     number   // expected max gap between check-ins (with a floor)
  health:      Health
  nextMs:      number   // predicted next check-in (0 = continuous)
}

// ── Helpers ───────────────────────────────────────────

function fmtDur(sec: number): string {
  sec = Math.max(0, Math.round(sec))
  if (sec < 60)    return `${sec}s`
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ${sec % 60}s`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`
}

// Observed inter-check-in gaps, built live while the panel is mounted.
function CadenceStrip({ history, effBand }: { history: number[]; effBand: number }) {
  if (history.length < 2) {
    return <div className={styles.strip}><span className={styles.stripEmpty}>collecting…</span></div>
  }
  const gaps: number[] = []
  for (let i = 1; i < history.length; i++) gaps.push((history[i] - history[i - 1]) / 1000)
  const recent = gaps.slice(-STRIP_GAPS)
  const max    = Math.max(effBand * 2, ...recent)
  return (
    <div className={styles.strip} title="observed check-in gaps">
      {recent.map((g, i) => {
        const color = g <= effBand        ? 'var(--status-alive)'
                    : g <= effBand * 2    ? 'var(--crimson-300)'
                    :                       'var(--crimson-600)'
        return (
          <div
            key={i}
            className={styles.stripBar}
            style={{ height: `${Math.max(12, (g / max) * 100)}%`, background: color }}
            title={`${fmtDur(g)} gap`}
          />
        )
      })}
    </div>
  )
}

// ── Component ─────────────────────────────────────────

export function BeaconHealthPanel() {
  const activeOperation       = useStore(s => s.activeOperation)
  const setSelectedCallbackId = useStore(s => s.setSelectedCallbackId)
  const setActiveRailView     = useStore(s => s.setActiveRailView)

  // All callbacks incl. inactive — a health view must see the dead ones.
  const { data, loading } = useSubscription(SUB_ALL_CALLBACKS, {
    variables: { operation_id: activeOperation?.id ?? 0 },
    skip:      !activeOperation,
  })
  const callbacks: Callback[] = data?.callback ?? []

  // Ticking clock — drives elapsed time, countdowns and heartbeat bars.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [statusFilter, setStatusFilter] = useState<'all' | 'problems' | Health>('problems')
  const [hostFilter,   setHostFilter]   = useState('')

  // Sleep config — parse once per data update, not per tick.
  const sleepCfg = useMemo(() => {
    const m = new Map<number, { intervalSec: number; jitterPct: number }>()
    for (const cb of callbacks) {
      m.set(cb.id, parseSleepNumbers(cb.sleep_info, cb.tasks[0], cb.payload.c2profileparametersinstances))
    }
    return m
  }, [callbacks])

  // Observed check-in history — appended whenever a last_checkin changes.
  const historyRef = useRef<Map<number, number[]>>(new Map())
  useEffect(() => {
    const hist = historyRef.current
    for (const cb of callbacks) {
      const lastMs = parseTs(cb.last_checkin).getTime()
      if (!Number.isFinite(lastMs)) continue
      const arr = hist.get(cb.id)
      if (!arr) { hist.set(cb.id, [lastMs]); continue }
      if (arr[arr.length - 1] !== lastMs) {
        arr.push(lastMs)
        if (arr.length > HISTORY_CAP) arr.shift()
      }
    }
  }, [callbacks])

  // Per-tick health — cheap arithmetic only.
  const stats: BeaconStat[] = useMemo(() => {
    return callbacks.map(cb => {
      const cfg        = sleepCfg.get(cb.id) ?? { intervalSec: 0, jitterPct: 0 }
      const lastMs     = parseTs(cb.last_checkin).getTime()
      const elapsedSec = Math.max(0, (now - lastMs) / 1000)
      const band       = cfg.intervalSec > 0 ? cfg.intervalSec * (1 + cfg.jitterPct / 100) : 0
      const effBand    = Math.max(band, 60)
      let health: Health
      if      (!cb.active)                            health = 'dead'
      else if (elapsedSec <= effBand + GRACE_SEC)     health = 'healthy'
      else if (elapsedSec <= effBand * 3 + GRACE_SEC) health = 'overdue'
      else                                            health = 'late'
      return {
        cb,
        intervalSec: cfg.intervalSec,
        jitterPct:   cfg.jitterPct,
        elapsedSec,
        effBand,
        health,
        nextMs: cfg.intervalSec > 0 ? lastMs + cfg.intervalSec * 1000 : 0,
      }
    })
  }, [callbacks, sleepCfg, now])

  const counts = useMemo(() => {
    const c: Record<Health, number> = { healthy: 0, overdue: 0, late: 0, dead: 0 }
    for (const s of stats) c[s.health]++
    return c
  }, [stats])

  const hostLc = hostFilter.trim().toLowerCase()
  const rows = useMemo(() => {
    let r = stats
    if      (statusFilter === 'problems') r = r.filter(s => s.health !== 'healthy')
    else if (statusFilter !== 'all')      r = r.filter(s => s.health === statusFilter)
    if (hostLc) r = r.filter(s =>
      s.cb.host.toLowerCase().includes(hostLc) ||
      (s.cb.user ?? '').toLowerCase().includes(hostLc) ||
      String(s.cb.display_id).includes(hostLc))
    return [...r].sort((a, b) =>
      HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.elapsedSec - a.elapsedSec)
  }, [stats, statusFilter, hostLc])

  const total = stats.length
  const shown = rows.slice(0, MAX_ROWS)

  const openCallback = (cb: Callback) => {
    setSelectedCallbackId(cb.id)
    setActiveRailView('callbacks')
  }

  const nextText = (s: BeaconStat): string => {
    if (s.health === 'dead') return 'inactive'
    if (s.intervalSec <= 0)  return 'continuous'
    const d = (s.nextMs - now) / 1000
    return d >= 0 ? `in ${fmtDur(d)}` : `overdue ${fmtDur(-d)}`
  }

  return (
    <div className={styles.panel}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Beacon Health</span>
          <span className={styles.meta}>
            {loading && !callbacks.length ? 'loading…' : `${total} agents`}
          </span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.toggle}>
            <button
              className={statusFilter === 'problems' ? styles.toggleOn : ''}
              onClick={() => setStatusFilter('problems')}
            >Problems</button>
            <button
              className={statusFilter === 'all' ? styles.toggleOn : ''}
              onClick={() => setStatusFilter('all')}
            >All</button>
          </div>
          <input
            className={styles.filterInput}
            placeholder="filter host / user / #id…"
            value={hostFilter}
            onChange={e => setHostFilter(e.target.value)}
          />
        </div>
      </div>

      {/* ── Summary ── */}
      <div className={styles.summary}>
        <div className={styles.cards}>
          {HEALTH_ORDER.map(h => (
            <button
              key={h}
              className={`${styles.card} ${statusFilter === h ? styles.cardActive : ''}`}
              onClick={() => setStatusFilter(f => (f === h ? 'problems' : h))}
            >
              <span className={styles.cardVal} style={{ color: HEALTH_META[h].color }}>
                {counts[h]}
              </span>
              <span className={styles.cardLbl}>{HEALTH_META[h].label}</span>
            </button>
          ))}
        </div>
        <div className={styles.distWrap}>
          <div className={styles.distBar}>
            {total > 0 && HEALTH_ORDER.map(h => counts[h] > 0 && (
              <div
                key={h}
                style={{ flexGrow: counts[h], background: HEALTH_META[h].color }}
                title={`${counts[h]} ${HEALTH_META[h].label}`}
              />
            ))}
          </div>
          <div className={styles.distLabel}>
            {total > 0 ? `${Math.round((counts.healthy / total) * 100)}% healthy` : '—'}
          </div>
        </div>
      </div>

      {/* ── Tier legend ── */}
      <div className={styles.legend}>
        {LEGEND.map(([h, desc]) => (
          <div key={h} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: HEALTH_META[h].color }} />
            <span className={styles.legendName} style={{ color: HEALTH_META[h].color }}>
              {HEALTH_META[h].label}
            </span>
            <span className={styles.legendDesc}>{desc}</span>
          </div>
        ))}
      </div>

      {/* ── Beacon list ── */}
      <div className={styles.scroll}>
        {!loading && total === 0 && (
          <div className={styles.empty}>no callbacks in this operation</div>
        )}
        {total > 0 && rows.length === 0 && (
          <div className={styles.empty}>no beacons match the current filter</div>
        )}

        {shown.map(s => {
          const cb   = s.cb
          const meta = HEALTH_META[s.health]
          return (
            <div
              key={cb.id}
              className={styles.row}
              onClick={() => openCallback(cb)}
              title="open callback"
            >
              <span className={styles.dot} style={{ background: meta.color }} />
              <span className={styles.healthTag} style={{ color: meta.color }}>{meta.label}</span>

              <div className={styles.idCell}>
                <span className={styles.host}>{cb.host || '—'}</span>
                <span className={styles.sub}>
                  #{cb.display_id} ·{' '}
                  <span style={{ color: agentColor(cb.payload.payloadtype.name) }}>
                    {cb.payload.payloadtype.name}
                  </span>{' '}
                  · {cb.user || '—'}
                </span>
              </div>

              <div className={styles.metric}>
                <span className={styles.mVal}>
                  {s.intervalSec > 0 ? fmtDur(s.intervalSec) : 'cont.'}
                  {s.jitterPct > 0 ? ` ±${s.jitterPct}%` : ''}
                </span>
                <span className={styles.mLbl}>sleep</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.mVal}>{timeSince(cb.last_checkin)}</span>
                <span className={styles.mLbl}>last check-in</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.mVal}>{nextText(s)}</span>
                <span className={styles.mLbl}>next</span>
              </div>

              <CadenceStrip history={historyRef.current.get(cb.id) ?? []} effBand={s.effBand} />
            </div>
          )
        })}

        {rows.length > MAX_ROWS && (
          <div className={styles.capNote}>
            showing {MAX_ROWS} of {rows.length} — narrow with the filter
          </div>
        )}
      </div>
    </div>
  )
}
