/* src/components/TaskFeed/BrowserScriptTable.tsx
   Generic renderer for a Mythic browserscript `table` output. Fully spec-driven:
   headers carry a type (string/number/size/button); cells carry plaintext +
   icons, or a `button` (task/menu/dictionary/string/table). Task buttons resolve
   their ui_feature → a loaded command on the callback and issue a task. Nothing
   here is command-specific, so every agent's table renders the same way.
*/

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useLazyQuery } from '@apollo/client'
import { CREATE_TASK, GET_UI_FEATURE_COMMANDS } from '@/apollo/operations'
import {
  iconGlyph,
  type BSTable, type BSRow, type BSCell, type BSHeader,
  type BSButton, type BSButtonOption, type BSViewType,
} from './browserScript'
import styles from './BrowserScript.module.css'

interface Ctx { callbackId: number; callbackDisplayId: number }

// ── humanise byte size (header type "size") ───────────
function humanSize(v: unknown): string {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return String(v ?? '')
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${parseFloat((n / Math.pow(1024, i)).toFixed(2))} ${units[i]}`
}

function cellText(cell: BSCell | undefined, type?: string): string {
  if (!cell) return ''
  if (type === 'size') return humanSize(cell.plaintext)
  return cell.plaintext === undefined || cell.plaintext === null ? '' : String(cell.plaintext)
}

// ── Task button (resolves ui_feature → command, tasks it) ──

function useUIFeatureTask({ callbackId, callbackDisplayId }: Ctx) {
  const [createTask] = useMutation(CREATE_TASK)
  const [resolve]    = useLazyQuery(GET_UI_FEATURE_COMMANDS, { fetchPolicy: 'no-cache' })

  return useCallback(async (opt: BSButtonOption) => {
    if (opt.disabled) return
    if (opt.getConfirmation && !window.confirm(opt.acceptText || 'Run this task?')) return

    const isString  = typeof opt.parameters === 'string'
    const params    = isString ? (opt.parameters as string) : JSON.stringify(opt.parameters ?? {})
    const location  = isString ? 'command_line' : 'browserscript'

    let cmd = opt.cmd
    if (!cmd && opt.ui_feature) {
      // ponytail: pick the first loaded command supporting the feature. Mythic
      // pops a select dialog when several match — rare; upgrade to a picker then.
      const { data } = await resolve({ variables: { callback_id: callbackId, ui_feature: opt.ui_feature } })
      cmd = data?.loadedcommands?.[0]?.command?.cmd
    }
    if (!cmd) {
      console.warn('browserscript task: no command for', opt.ui_feature ?? opt)
      return
    }
    createTask({ variables: {
      callback_id: callbackDisplayId, command: cmd, params,
      tasking_location: location, original_params: params,
    } })
  }, [createTask, resolve, callbackId, callbackDisplayId])
}

// ── View dialog (dictionary / string / table buttons) ──

interface DialogState { kind: BSViewType; opt: BSButtonOption }

function ViewDialog({ state, ctx, onClose }: { state: DialogState; ctx: Ctx; onClose: () => void }) {
  const { kind, opt } = state
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHead}>
          <span>{opt.title || opt.name || 'Details'}</span>
          <button className={styles.dialogClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.dialogBody}>
          {kind === 'string' && <pre className={styles.dialogPre}>{String(opt.value ?? '')}</pre>}
          {kind === 'dictionary' && (
            <table className={styles.kvTable}><tbody>
              {Object.entries((opt.value as Record<string, unknown>) || {}).map(([k, v]) => (
                <tr key={k}>
                  <td className={styles.kvKey}>{k}</td>
                  <td className={styles.kvVal}>{typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
          {kind === 'table' && <BrowserScriptTable table={opt.value as BSTable} ctx={ctx} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Menu dropdown (button type "menu") ────────────────

function ButtonMenu({ button, ctx, onTask, onView }: {
  button: BSButton; ctx: Ctx
  onTask: (o: BSButtonOption) => void
  onView: (s: DialogState) => void
}) {
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null)
  const options = (button.value as BSButtonOption[]) || []

  const pick = (o: BSButtonOption) => {
    setOpen(null)
    if (o.type === 'task') onTask(o)
    else onView({ kind: o.type as BSViewType, opt: o })
  }

  return (
    <div className={styles.menuWrap}>
      <button
        className={styles.actBtn}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          setOpen(o => (o ? null : { x: r.left, y: r.bottom }))
        }}
      >{iconGlyph(button.startIcon)} {button.name || 'actions'} ▾</button>
      {open && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setOpen(null)} />
          <div className={styles.menu} style={{ left: open.x, top: open.y }}>
            {options.map((o, i) => (
              <button
                key={(o.name || '') + i}
                className={styles.menuItem}
                disabled={o.disabled}
                onClick={() => pick(o)}
                title={o.hoverText || ''}
              >{iconGlyph(o.startIcon)} {o.name}</button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

// ── Button cell dispatch ──────────────────────────────

function ButtonCell({ button, ctx, onView }: {
  button: BSButton; ctx: Ctx; onView: (s: DialogState) => void
}) {
  const task = useUIFeatureTask(ctx)
  const label = button.name ?? (button.startIcon ? iconGlyph(button.startIcon) : 'run')

  if (button.type === 'menu') {
    return <ButtonMenu button={button} ctx={ctx} onTask={task} onView={onView} />
  }
  const onClick = () => {
    if (button.type === 'task') task(button)
    else onView({ kind: button.type as BSViewType, opt: button })
  }
  return (
    <button
      className={styles.actBtn}
      disabled={button.disabled}
      title={button.hoverText || ''}
      onClick={onClick}
    >{iconGlyph(button.startIcon)} {label}</button>
  )
}

// ── Cell ──────────────────────────────────────────────

function Cell({ cell, header, ctx, onView, onCopy, copied }: {
  cell: BSCell | undefined; header: BSHeader; ctx: Ctx
  onView: (s: DialogState) => void
  onCopy: (t: string) => void; copied: string | null
}) {
  if (header.type === 'button' && cell?.button) {
    return <td className={styles.tdAct}><ButtonCell button={cell.button} ctx={ctx} onView={onView} /></td>
  }
  const text  = cellText(cell, header.type)
  const canCopy = cell?.copyIcon && !!text
  return (
    <td
      className={`${styles.td} ${header.fillWidth ? styles.tdGrow : ''} ${canCopy ? styles.tdCopy : ''}`}
      style={cell?.cellStyle}
      title={cell?.plaintextHoverText || text}
      onClick={canCopy ? () => onCopy(text) : undefined}
    >
      {cell?.startIcon && <span className={styles.cellIcon} title={cell.startIconHoverText}
        style={cell.startIconColor ? { color: cell.startIconColor } : undefined}>{iconGlyph(cell.startIcon)} </span>}
      {text}
      {cell?.endIcon && <span className={styles.cellIcon} title={cell.endIconHoverText}
        style={cell.endIconColor ? { color: cell.endIconColor } : undefined}> {iconGlyph(cell.endIcon)}</span>}
      {canCopy && copied === text && <span className={styles.copiedTag}>✓</span>}
    </td>
  )
}

// ── Table ─────────────────────────────────────────────

export function BrowserScriptTable({ table, ctx }: { table: BSTable; ctx: Ctx }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const headers = table?.headers ?? []
  const rows    = table?.rows ?? []

  const copy = useCallback((t: string) => {
    navigator.clipboard?.writeText(t).then(() => {
      setCopied(t)
      setTimeout(() => setCopied(c => (c === t ? null : c)), 900)
    }).catch(() => {})
  }, [])

  return (
    <div className={styles.browser}>
      {table?.title && (
        <div className={styles.toolbar}>
          <span className={styles.title}>{table.title}</span>
          <span className={styles.count}>{rows.length}</span>
        </div>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={h.fillWidth ? styles.thGrow : undefined}
                    style={h.width ? { width: h.width } : undefined}>{h.plaintext}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: BSRow, ri) => (
              <tr key={ri} className={styles.row} style={row.rowStyle}>
                {headers.map((h, ci) => (
                  <Cell key={ci} cell={row[h.plaintext]} header={h} ctx={ctx}
                        onView={setDialog} onCopy={copy} copied={copied} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className={styles.empty}>(no rows)</div>}
      </div>
      {dialog && <ViewDialog state={dialog} ctx={ctx} onClose={() => setDialog(null)} />}
    </div>
  )
}
