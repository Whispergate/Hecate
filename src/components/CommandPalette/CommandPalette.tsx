/* ═══════════════════════════════════════════════════
   hecate/src/components/CommandPalette/CommandPalette.tsx

   Cmd/Ctrl+K — fuzzy jump to any rail view or callback.
   ═══════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import type { HecateStore } from '@/store'
import styles from './CommandPalette.module.css'

type RailView = HecateStore['activeRailView']

interface PaletteItem {
  kind:     'view' | 'callback'
  id:       string
  title:    string
  subtitle: string
  hay:      string  // pre-lowered search haystack
  run:      () => void
}

const RAIL_VIEWS: { id: RailView; title: string }[] = [
  { id: 'overview',    title: 'Overview' },
  { id: 'callbacks',   title: 'Callbacks' },
  { id: 'health',      title: 'Beacon Health' },
  { id: 'payloads',    title: 'Payloads' },
  { id: 'services',    title: 'Services' },
  { id: 'proxies',     title: 'Proxies & Pivots' },
  { id: 'credentials', title: 'Credentials' },
  { id: 'files',       title: 'File Browser' },
  { id: 'operations',  title: 'Operations' },
  { id: 'timeline',    title: 'Attack Timeline' },
  { id: 'replay',      title: 'Session Replay' },
  { id: 'eventing',    title: 'Eventing Workflows' },
  { id: 'attack',      title: 'ATT&CK Matrix' },
  { id: 'logs',        title: 'Event Log' },
  { id: 'report',      title: 'Report Builder' },
]

// Token-AND match: every whitespace-separated query token must appear in hay.
function matches(hay: string, tokens: string[]): boolean {
  for (const t of tokens) if (!hay.includes(t)) return false
  return true
}

export function CommandPalette() {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [active, setActive] = useState(0)

  const callbacks            = useStore((s) => s.callbacks)
  const setActiveRailView    = useStore((s) => s.setActiveRailView)
  const setSelectedCallbackId = useStore((s) => s.setSelectedCallbackId)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  // Cmd/Ctrl+K toggle — global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // focus after the DOM paints
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = []
    for (const v of RAIL_VIEWS) {
      out.push({
        kind:     'view',
        id:       `view:${v.id}`,
        title:    v.title,
        subtitle: 'rail view',
        hay:      `${v.title} ${v.id}`.toLowerCase(),
        run:      () => setActiveRailView(v.id),
      })
    }
    for (const cb of callbacks) {
      const agent = cb.payload.payloadtype.name
      const sub   = `#${cb.display_id} · ${agent} · ${cb.user || '—'}`
      out.push({
        kind:     'callback',
        id:       `cb:${cb.id}`,
        title:    cb.host || '—',
        subtitle: sub,
        hay:      `${cb.host} ${cb.user} ${agent} ${cb.display_id} ${cb.ip}`.toLowerCase(),
        run:      () => {
          setSelectedCallbackId(cb.id)
          setActiveRailView('callbacks')
        },
      })
    }
    return out
  }, [callbacks, setActiveRailView, setSelectedCallbackId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    const tokens = q.split(/\s+/).filter(Boolean)
    return items.filter((it) => matches(it.hay, tokens))
  }, [items, query])

  // Cap displayed results — typing narrows the list anyway
  const visible = filtered.slice(0, 30)

  // Keep `active` in range when filtering shrinks the list
  useEffect(() => { setActive(0) }, [query])

  // Scroll the active row into view on keyboard nav
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!open) return null

  const close = () => setOpen(false)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, visible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = visible[active]
      if (it) { it.run(); close() }
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={close}>
      <div className={styles.palette} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Jump to view or callback…"
          spellCheck={false}
          autoComplete="off"
        />
        <div ref={listRef} className={styles.list}>
          {visible.length === 0 && (
            <div className={styles.empty}>no matches</div>
          )}
          {visible.map((it, i) => (
            <button
              key={it.id}
              data-idx={i}
              className={`${styles.row} ${i === active ? styles.rowActive : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => { it.run(); close() }}
            >
              <span className={`${styles.kindTag} ${it.kind === 'view' ? styles.kindView : styles.kindCb}`}>
                {it.kind === 'view' ? 'view' : 'cb'}
              </span>
              <span className={styles.title}>{it.title}</span>
              <span className={styles.subtitle}>{it.subtitle}</span>
            </button>
          ))}
        </div>
        <div className={styles.hint}>
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span className={styles.hintRight}>{filtered.length} match{filtered.length === 1 ? '' : 'es'}</span>
        </div>
      </div>
    </div>
  )
}
