/* src/components/TaskFeed/BrowserTable.tsx
   Generic, config-driven renderer for Apollo browser-script table outputs that
   carry interactive action buttons (jobs, sc, net_*, reg_query, tickets, …).

   Each Apollo browser script returns {table:[{headers,rows,title}]} where some
   columns are `type:"button"` / `type:"menu"` that issue a follow-up task via a
   `ui_feature`. We replicate that here: dispatch is keyed on the task's
   command_name (so we already know the shape) and the matched config maps the
   raw JSON rows → columns + per-row actions. Action `command` values are the
   real Mythic command behind each ui_feature (resolved from supported_ui_features).
*/

import { useState, useCallback } from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_TASK } from '@/apollo/operations'
import styles from './BrowserTable.module.css'

// ── Types ─────────────────────────────────────────────

type Row = any

interface ColDef {
  key:    string
  label:  string
  get?:   (row: Row) => string  // defaults to row[key]
  copy?:  boolean
  grow?:  boolean
}

interface ActionDef {
  label:     string
  command:   string                 // real Mythic command behind the ui_feature
  params:    (row: Row) => string
  disabled?: (row: Row) => boolean
  confirm?:  string                  // window.confirm text; omit = no confirm
  danger?:   boolean
}

interface FooterAction {
  label:   string
  command: string
  params?: string
}

export interface BrowserTableConfig {
  title:          string | ((rows: Row[]) => string)
  columns:        ColDef[]
  actions:        (row: Row) => ActionDef[]
  footerActions?: FooterAction[]
}

// ── Shared parser ─────────────────────────────────────
// Apollo sends one JSON array per response chunk, concatenated. Walk the string
// tracking string literals (so brackets inside paths/cmdlines don't confuse
// depth) and collect every balanced top-level array/object. Non-JSON chunks
// (e.g. ticket_cache_list's leading current-LUID line) are skipped.

export function parseConcatRows(raw: string): Row[] | null {
  const s = raw.trim()
  if (!s) return null
  const rows: Row[] = []
  let depth = 0, start = -1, inStr = false, esc = false, sawArray = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '[' || ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const v = JSON.parse(s.slice(start, i + 1))
          if (Array.isArray(v)) { rows.push(...v); sawArray = true }
          else if (v !== null && typeof v === 'object') rows.push(v)
        } catch { /* skip junk chunk */ }
        start = -1
      }
    }
  }
  return (rows.length || sawArray) ? rows : null
}

// ── Component ─────────────────────────────────────────

interface Props {
  config:            BrowserTableConfig
  rows:              Row[]
  callbackDisplayId: number
}

function cellValue(col: ColDef, row: Row): string {
  const v = col.get ? col.get(row) : row?.[col.key]
  return v === undefined || v === null ? '' : String(v)
}

export function BrowserTable({ config, rows, callbackDisplayId }: Props) {
  const [createTask] = useMutation(CREATE_TASK)
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [copied, setCopied]     = useState<string | null>(null)

  const run = useCallback((a: ActionDef, row: Row) => {
    if (a.disabled?.(row)) return
    if (a.confirm && !window.confirm(a.confirm)) return
    const params = a.params(row)
    createTask({
      variables: {
        callback_id:      callbackDisplayId,
        command:          a.command,
        params,
        tasking_location: 'command_line',
        original_params:  params,
      },
    })
    setOpenMenu(null)
  }, [callbackDisplayId, createTask])

  const runFooter = useCallback((f: FooterAction) => {
    const params = f.params ?? ''
    createTask({
      variables: {
        callback_id:      callbackDisplayId,
        command:          f.command,
        params,
        tasking_location: 'command_line',
        original_params:  params,
      },
    })
  }, [callbackDisplayId, createTask])

  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied(c => (c === text ? null : c)), 900)
    }).catch(() => {})
  }, [])

  const title = typeof config.title === 'function' ? config.title(rows) : config.title

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{rows.length}</span>
        {config.footerActions?.map(f => (
          <button key={f.label} className={styles.footerBtn} onClick={() => runFooter(f)}>+ {f.label}</button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thAct} />
              {config.columns.map(c => (
                <th key={c.key} className={c.grow ? styles.thGrow : undefined}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const actions = config.actions(row)
              const isMenu  = actions.length > 1
              return (
                <tr key={idx} className={styles.row}>
                  <td className={styles.tdAct}>
                    {isMenu ? (
                      <div className={styles.menuWrap}>
                        <button
                          className={styles.actBtn}
                          onClick={() => setOpenMenu(m => (m === idx ? null : idx))}
                        >actions ▾</button>
                        {openMenu === idx && (
                          <>
                            <div className={styles.menuBackdrop} onClick={() => setOpenMenu(null)} />
                            <div className={styles.menu}>
                              {actions.map(a => {
                                const dis = a.disabled?.(row)
                                return (
                                  <button
                                    key={a.label}
                                    className={`${styles.menuItem} ${a.danger ? styles.menuItemDanger : ''}`}
                                    disabled={dis}
                                    onClick={() => run(a, row)}
                                  >{a.label}</button>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      actions.map(a => {
                        const dis = a.disabled?.(row)
                        return (
                          <button
                            key={a.label}
                            className={`${styles.actBtn} ${a.danger ? styles.actDanger : ''}`}
                            disabled={dis}
                            title={dis ? 'unavailable' : a.label}
                            onClick={() => run(a, row)}
                          >{a.label}</button>
                        )
                      })
                    )}
                  </td>
                  {config.columns.map(c => {
                    const val = cellValue(c, row)
                    return (
                      <td
                        key={c.key}
                        className={`${styles.td} ${c.copy && val ? styles.tdCopy : ''}`}
                        title={c.copy && val ? (copied === val ? 'copied ✓' : 'click to copy') : val}
                        onClick={c.copy && val ? () => copy(val) : undefined}
                      >{val}{c.copy && val && copied === val && <span className={styles.copiedTag}>✓</span>}</td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className={styles.empty}>(no rows)</div>}
      </div>
    </div>
  )
}
