/* ═══════════════════════════════════════════════════
   hecate/src/components/Sidebar/Sidebar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useMemo } from 'react'
import { useStore, useSelectedCallback } from '@/store'
import type { Callback } from '@/store'
import { integrityLabel, timeSince, parseTs, formatSleepInterval, formatSleepJitter } from './utils'
import { CallbackContextMenu } from '@/components/CallbackContextMenu/CallbackContextMenu'
import { agentColor } from '@/agentColor'
import styles from './Sidebar.module.css'

interface CtxMenu { cb: Callback; x: number; y: number }
type StatusFilter = 'alive' | 'idle' | 'dead'

export function Sidebar() {
  const { selectedCallbackId, setSelectedCallbackId, multiSelectedIds, setMultiSelectedIds, callbacks, callbackAnnotations, activeCallbackPorts } = useStore()
  const callbackAliveMs       = useStore((s) => s.settings.callbackAliveMs)
  const callbackIdleMs        = useStore((s) => s.settings.callbackIdleMs)
  const showCallbackDisplayId = useStore((s) => s.settings.showCallbackDisplayId)

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

  const getStatus = (elapsed: number): StatusFilter =>
    elapsed < callbackAliveMs ? 'alive' : elapsed < callbackIdleMs ? 'idle' : 'dead'

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

  const visible = sorted.filter(({ cb, elapsed }) => {
    if (filterStatus.size > 0 && !filterStatus.has(getStatus(elapsed))) return false
    if (filterAgents.size > 0 && !filterAgents.has(cb.payload.payloadtype.name)) return false
    if (needle) {
      const haystack = [cb.host, cb.user, cb.ip, cb.os, cb.description ?? '', cb.domain ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })

  return (
    <aside className={styles.sidebar}>
      {/* ── Callback list ── */}
      <div className={styles.section}>
        <div className={`sec-label ${styles.callbacksHeader}`}>
          <span>Callbacks ({visible.length}{visible.length !== callbacks.length ? `/${callbacks.length}` : ''})</span>
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

        {callbacks.length === 0 && (
          <div className={styles.empty}>No callbacks yet</div>
        )}
        {callbacks.length > 0 && visible.length === 0 && (
          <div className={styles.empty}>No matches</div>
        )}

        {visible.map(({ cb, elapsed }) => {
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
            <div
              key={cb.id}
              className={`${styles.callbackItem} ${cb.id === selectedCallbackId ? styles.active : ''} ${isMultiSelected && cb.id !== selectedCallbackId ? styles.multiSelected : ''} ${integrityBorder}`}
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
            </div>
          )
        })}
      </div>

      {/* ── Selected callback detail ── */}
      {selected && (
        <div className={`${styles.section} ${styles.detail}`}>
          <div
            className={`sec-label ${styles.detailHeader}`}
            onContextMenu={(e) => openMenu(e, selected)}
            title="Right-click for options"
          >
            {selected.host}
            {selected.locked && <span className={styles.lockBadge}>🔒</span>}
          </div>

          {selected.description && (
            <div className={styles.descRow}>{selected.description}</div>
          )}

          {impersonatedUser && (
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Token</span>
              <span className={`${styles.infoVal} ${styles.tokenVal}`} title={`Impersonating: ${impersonatedUser}`}>
                ⚡ {impersonatedUser}
              </span>
            </div>
          )}

          {[
            ['Integrity', integrityLabel(selected.integrity_level)],
            ['User',      selected.user || '—'],
            ['Domain',    selected.domain || '—'],
            ['PID',       String(selected.pid)],
            ['Sleep',     formatSleepInterval(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)],
            ['Jitter',    formatSleepJitter(selected.sleep_info, selected.tasks[0], selected.payload.c2profileparametersinstances)],
            ['IP',        selected.ip],
            ['OS',        selected.os],
            ['Agent',     selected.payload.payloadtype.name],
            ['C2',        selected.callbackc2profiles[0]?.c2profile.name ?? '—'],
          ].map(([k, v]) => (
            <div key={k} className={styles.infoRow}>
              <span className={styles.infoKey}>{k}</span>
              <span
                className={`${styles.infoVal} ${k === 'Integrity' && selected.integrity_level >= 3 ? styles.hiVal : ''} ${k === 'User' && impersonatedUser ? styles.mutedVal : ''}`}
              >
                {v}
              </span>
            </div>
          ))}

          {selected.cwd?.trim() && (
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Dir</span>
              <span className={`${styles.infoVal} ${styles.cwdVal}`} title={selected.cwd}>
                {selected.cwd}
              </span>
            </div>
          )}
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
