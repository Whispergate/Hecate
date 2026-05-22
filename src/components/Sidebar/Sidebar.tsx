/* ═══════════════════════════════════════════════════
   hecate/src/components/Sidebar/Sidebar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useStore, useSelectedCallback } from '@/store'
import type { Callback } from '@/store'
import { integrityLabel, timeSince, parseTs, formatSleepInterval, formatSleepJitter } from './utils'
import { CallbackContextMenu } from '@/components/CallbackContextMenu/CallbackContextMenu'
import { agentColor } from '@/agentColor'
import styles from './Sidebar.module.css'

// Fixed-height virtualization: every callback row is exactly one of these
// heights, chosen by the `callbackDensity` setting. `.callbackItem` content must
// stay within the height — it has overflow:hidden as a safety clip.
const ROW_H_COMFORTABLE = 84
const ROW_H_COMPACT     = 50
const OVERSCAN          = 6

interface CtxMenu { cb: Callback; x: number; y: number }
type StatusFilter = 'alive' | 'idle' | 'dead'

// One label/value row in the selected-callback detail panel. When `copy` is
// provided the value renders as a click-to-copy button.
function InfoRow({ label, value, copy, valueClass, title }: {
  label: string; value: string; copy?: string; valueClass?: string; title?: string
}) {
  const [copied, setCopied] = useState(false)
  const doCopy = () => {
    if (!copy || !navigator.clipboard) return
    navigator.clipboard.writeText(copy)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })
      .catch(() => { /* clipboard unavailable */ })
  }
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoKey}>{label}</span>
      {copy ? (
        <button
          className={`${styles.infoVal} ${styles.copyVal} ${valueClass ?? ''}`}
          onClick={doCopy}
          title={title ?? `Copy ${label.toLowerCase()}`}
        >
          <span className={styles.copyText}>{value}</span>
          <span className={styles.copyIcon}>{copied ? '✓' : '⧉'}</span>
        </button>
      ) : (
        <span className={`${styles.infoVal} ${valueClass ?? ''}`} title={title}>{value}</span>
      )}
    </div>
  )
}

export function Sidebar() {
  const { selectedCallbackId, setSelectedCallbackId, multiSelectedIds, setMultiSelectedIds, callbacks, callbackAnnotations, activeCallbackPorts } = useStore()
  const callbackAliveMs       = useStore((s) => s.settings.callbackAliveMs)
  const callbackIdleMs        = useStore((s) => s.settings.callbackIdleMs)
  const showCallbackDisplayId = useStore((s) => s.settings.showCallbackDisplayId)
  const callbackDensity       = useStore((s) => s.settings.callbackDensity)
  const updateSettings        = useStore((s) => s.updateSettings)
  const compact               = callbackDensity === 'compact'
  const ROW_H                 = compact ? ROW_H_COMPACT : ROW_H_COMFORTABLE

  const selected = useSelectedCallback()
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  const impersonatedUser = selected?.impersonation_context?.trim() ?? ''
  const [filterText, setFilterText]     = useState('')
  const [filterStatus, setFilterStatus] = useState<Set<StatusFilter>>(new Set())
  const [filterAgents, setFilterAgents] = useState<Set<string>>(new Set())

  const openMenu = (e: React.MouseEvent, cb: Callback) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ cb, x: e.clientX, y: e.clientY })
  }

  const handleCallbackClick = (e: React.MouseEvent, cbId: number) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const already = multiSelectedIds.includes(cbId)
      if (already) {
        const next = multiSelectedIds.filter(id => id !== cbId)
        setMultiSelectedIds(next)
        if (cbId === selectedCallbackId) setSelectedCallbackId(next[next.length - 1] ?? null)
      } else {
        setMultiSelectedIds([...multiSelectedIds, cbId])
        setSelectedCallbackId(cbId)
      }
    } else {
      setSelectedCallbackId(cbId)
      setMultiSelectedIds([])
    }
  }

  const agentTypes = useMemo(() =>
    [...new Set(callbacks.map(cb => cb.payload.payloadtype.name))].sort(),
    [callbacks]
  )

  const toggleStatus = (s: StatusFilter) => setFilterStatus(prev => {
    const next = new Set(prev)
    next.has(s) ? next.delete(s) : next.add(s)
    return next
  })

  const toggleAgent = (a: string) => setFilterAgents(prev => {
    const next = new Set(prev)
    next.has(a) ? next.delete(a) : next.add(a)
    return next
  })

  const needle = filterText.toLowerCase()

  const sorted = useMemo(() => [...callbacks]
    .map((cb) => ({ cb, elapsed: Date.now() - parseTs(cb.last_checkin).getTime() }))
    .sort((a, b) => {
      const rank = (e: number) => e < callbackAliveMs ? 0 : e < callbackIdleMs ? 1 : 2
      const dr = rank(a.elapsed) - rank(b.elapsed)
      return dr !== 0 ? dr : b.cb.id - a.cb.id
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callbacks, callbackAliveMs, callbackIdleMs]
  )

  const portsByCallbackId = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const p of activeCallbackPorts) {
      if (!map.has(p.callback_id)) map.set(p.callback_id, [])
      map.get(p.callback_id)!.push(p.local_port)
    }
    return map
  }, [activeCallbackPorts])

  const visible = useMemo(() => sorted.filter(({ cb, elapsed }) => {
    if (filterStatus.size > 0) {
      const st: StatusFilter = elapsed < callbackAliveMs ? 'alive'
                             : elapsed < callbackIdleMs ? 'idle' : 'dead'
      if (!filterStatus.has(st)) return false
    }
    if (filterAgents.size > 0 && !filterAgents.has(cb.payload.payloadtype.name)) return false
    if (needle) {
      const haystack = [cb.host, cb.user, cb.ip, cb.os, cb.description ?? '', cb.domain ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  }), [sorted, filterStatus, filterAgents, needle, callbackAliveMs, callbackIdleMs])

  // ── List virtualization ──
  // Only the rows in (and just around) the viewport are rendered, so the list
  // stays cheap at thousands of callbacks even though it re-renders on every
  // SUB_CALLBACKS push.
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setViewportH(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A changed filter result set — or a density change (rows resize) — should
  // start back at the top so the pixel offset stays meaningful.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [needle, filterStatus, filterAgents, callbackDensity])

  const firstIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const lastIdx  = Math.min(visible.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
  const windowed = visible.slice(firstIdx, lastIdx)

  return (
    <aside className={styles.sidebar}>
      {/* ── Callback list ── */}
      <div className={styles.listSection}>
        <div className={`sec-label ${styles.callbacksHeader}`}>
          <span>Callbacks ({visible.length}{visible.length !== callbacks.length ? `/${callbacks.length}` : ''})</span>
          <div className={styles.headerRight}>
            {multiSelectedIds.length > 1 && (
              <span className={styles.multiBadge}>
                {multiSelectedIds.length} selected
                <button
                  className={styles.multiClear}
                  onClick={() => setMultiSelectedIds([])}
                  title="Clear multi-selection"
                >✕</button>
              </span>
            )}
            <button
              className={styles.densityBtn}
              onClick={() => updateSettings({ callbackDensity: compact ? 'comfortable' : 'compact' })}
              title={`Row density: ${callbackDensity} — click to switch`}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {compact
                  ? <path d="M3 3.5h10M3 6.5h10M3 9.5h10M3 12.5h10" />
                  : <path d="M3 4h10M3 8h10M3 12h10" />}
              </svg>
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className={styles.filterBar}>
          <input
            className={styles.filterInput}
            type="text"
            placeholder="filter host / user / ip…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
          <div className={styles.filterChips}>
            {(['alive', 'idle', 'dead'] as StatusFilter[]).map(s => (
              <button
                key={s}
                className={`${styles.chip} ${styles[`chip_${s}`]} ${filterStatus.has(s) ? styles.chipActive : ''}`}
                onClick={() => toggleStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
          {agentTypes.length > 1 && (
            <div className={styles.filterChips}>
              {agentTypes.map(a => (
                <button
                  key={a}
                  className={`${styles.chip} ${filterAgents.has(a) ? styles.chipActiveAgent : ''}`}
                  onClick={() => toggleAgent(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Virtualized callback rows ── */}
        <div
          ref={listRef}
          className={styles.listScroll}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        >
          {callbacks.length === 0 && (
            <div className={styles.empty}>No callbacks yet</div>
          )}
          {callbacks.length > 0 && visible.length === 0 && (
            <div className={styles.empty}>No matches</div>
          )}

          {visible.length > 0 && (
            <div className={styles.listSpacer} style={{ height: visible.length * ROW_H }}>
              {windowed.map(({ cb, elapsed }, i) => {
                const idx   = firstIdx + i
                const alive = elapsed < callbackAliveMs
                const idle  = !alive && elapsed < callbackIdleMs
                const statusClass = alive ? styles.alive : idle ? styles.idle : styles.dead
                const integrityBorder = cb.integrity_level >= 3 ? styles.integrityHigh
                                      : cb.integrity_level === 2 ? styles.integrityMed : ''
                const integrityIcon   = cb.integrity_level >= 3 ? styles.integrityIconHigh
                                      : cb.integrity_level === 2 ? styles.integrityIconMed : ''

                const isMultiSelected = multiSelectedIds.includes(cb.id)
                const annotColor  = callbackAnnotations[cb.display_id] ?? ''
                const annotTitle  = cb.description || annotColor
                const activePorts = portsByCallbackId.get(cb.id) ?? []
                return (
                  <div key={cb.id} className={styles.vrow} style={{ top: idx * ROW_H, height: ROW_H }}>
                    <div
                      className={`${styles.callbackItem} ${compact ? styles.compact : ''} ${cb.id === selectedCallbackId ? styles.active : ''} ${isMultiSelected && cb.id !== selectedCallbackId ? styles.multiSelected : ''} ${integrityBorder}`}
                      onClick={(e) => handleCallbackClick(e, cb.id)}
                      onContextMenu={(e) => openMenu(e, cb)}
                    >
                      <span className={`${styles.statusDot} ${statusClass}`} />
                      <div className={styles.cbHost}>
                        {showCallbackDisplayId && <span className={styles.cbId}>#{cb.display_id} </span>}
                        {cb.host}
                        {cb.locked && <span className={styles.lockBadge}>🔒</span>}
                        {cb.integrity_level >= 2 && <span className={integrityIcon}>▲</span>}
                        {activePorts.length > 0 && (
                          <span
                            className={styles.proxyChip}
                            title={activePorts.map(p => `:${p}`).join(', ')}
                          >
                            {activePorts.length === 1 ? `:${activePorts[0]}` : `${activePorts.length}⇄`}
                          </span>
                        )}
                        {annotColor && (
                          <span
                            className={styles.annotDot}
                            style={{ background: annotColor }}
                            title={annotTitle || annotColor}
                          />
                        )}
                      </div>
                      <div className={styles.agentIconWrap} title={cb.payload.payloadtype.name}>
                        <span
                          className={styles.agentIconFallback}
                          style={{ color: agentColor(cb.payload.payloadtype.name) }}
                        >
                          {cb.payload.payloadtype.name.slice(0, 2).toUpperCase()}
                        </span>
                        <img
                          src={`/static/${cb.payload.payloadtype.name}_dark.svg`}
                          className={styles.agentIconImg}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                          alt=""
                        />
                      </div>
                      {compact ? (
                        <div className={styles.cbMeta}>
                          <span>{cb.user || cb.payload.payloadtype.name}</span>
                          <span>{timeSince(cb.last_checkin)}</span>
                        </div>
                      ) : (
                        <>
                          <div className={styles.cbMeta}>
                            <span>{cb.payload.payloadtype.name} · {cb.os}</span>
                            <span>{timeSince(cb.last_checkin)}</span>
                          </div>
                          {cb.user && (
                            <div className={styles.cbUser}>
                              <span
                                className={styles.cbUserName}
                                style={cb.impersonation_context?.trim() ? { opacity: 0.45 } : undefined}
                              >
                                {cb.user}
                              </span>
                              {cb.impersonation_context?.trim() && (
                                <>
                                  <span className={styles.cbUserArrow}> → </span>
                                  <span className={styles.cbUserToken}>⚡ {cb.impersonation_context.trim()}</span>
                                </>
                              )}
                            </div>
                          )}
                          {cb.description && (
                            <div className={styles.cbDesc}>{cb.description}</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Selected callback detail ── */}
      {selected && (
        <div key={selected.id} className={styles.detail}>
          <div
            className={`sec-label ${styles.detailHeader}`}
            onContextMenu={(e) => openMenu(e, selected)}
            title="Right-click for options"
          >
            {selected.host}
            {selected.locked && <span className={styles.lockBadge}>🔒</span>}
          </div>

          <div className={styles.detailScroll}>
            {selected.description && (
              <div className={styles.descRow}>{selected.description}</div>
            )}

            <div className={styles.detailGroup}>Identity</div>
            {impersonatedUser && (
              <InfoRow
                label="Token"
                value={`⚡ ${impersonatedUser}`}
                copy={impersonatedUser}
                valueClass={styles.tokenVal}
                title={`Impersonating: ${impersonatedUser}`}
              />
            )}
            <InfoRow
              label="User"
              value={selected.user || '—'}
              copy={selected.user || undefined}
              valueClass={impersonatedUser ? styles.mutedVal : undefined}
            />
            <InfoRow label="Domain" value={selected.domain || '—'} />
            <InfoRow
              label="Integrity"
              value={integrityLabel(selected.integrity_level)}
              valueClass={selected.integrity_level >= 3 ? styles.hiVal : undefined}
            />

            <div className={styles.detailGroup}>Process</div>
            <InfoRow label="PID" value={String(selected.pid)} copy={String(selected.pid)} />
            <InfoRow label="OS" value={selected.os || '—'} />
            {selected.cwd?.trim() && (
              <InfoRow
                label="Dir"
                value={selected.cwd}
                copy={selected.cwd}
                valueClass={styles.cwdVal}
                title={selected.cwd}
              />
            )}

            <div className={styles.detailGroup}>Comms</div>
            <InfoRow label="IP" value={selected.ip || '—'} copy={selected.ip || undefined} />
            <InfoRow label="Agent" value={selected.payload.payloadtype.name} />
            <InfoRow label="C2" value={selected.callbackc2profiles[0]?.c2profile.name ?? '—'} />
            <InfoRow
              label="Sleep"
              value={formatSleepInterval(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)}
            />
            <InfoRow
              label="Jitter"
              value={formatSleepJitter(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)}
            />
          </div>
        </div>
      )}

      {ctxMenu && (
        <CallbackContextMenu
          cb={ctxMenu.cb}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </aside>
  )
}
