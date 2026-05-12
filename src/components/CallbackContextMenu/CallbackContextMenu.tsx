/* hecate/src/components/CallbackContextMenu/CallbackContextMenu.tsx */

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@apollo/client'
import {
  UPDATE_CALLBACK_DESCRIPTION,
  LOCK_CALLBACK,
  UNLOCK_CALLBACK,
  HIDE_CALLBACK,
  CREATE_TASK,
} from '@/apollo/operations'
import { useStore } from '@/store'
import type { Callback } from '@/store'
import { ANNOT_SWATCHES } from '@/annotationColors'
import styles from './CallbackContextMenu.module.css'

interface Props {
  cb: Callback
  x: number
  y: number
  onClose: () => void
}

type View = 'menu' | 'annotate' | 'confirmExit'

export function CallbackContextMenu({ cb, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  const storedColor           = useStore((s) => s.callbackAnnotations[cb.display_id] ?? '')
  const setCallbackAnnotation = useStore((s) => s.setCallbackAnnotation)

  const [view,  setView]  = useState<View>('menu')
  const [desc,  setDesc]  = useState(cb.description ?? '')
  const [color, setColor] = useState(storedColor)

  const [updateDesc] = useMutation(UPDATE_CALLBACK_DESCRIPTION)
  const [lockCb]     = useMutation(LOCK_CALLBACK)
  const [unlockCb]   = useMutation(UNLOCK_CALLBACK)
  const [hideCb]     = useMutation(HIDE_CALLBACK)
  const [createTask] = useMutation(CREATE_TASK)

  useEffect(() => {
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const menuHeight = view === 'annotate' ? 200 : view === 'confirmExit' ? 100 : 175
  const menuWidth  = view === 'annotate' ? 230 : 180
  const style: React.CSSProperties = {
    position: 'fixed',
    top:  y + menuHeight > window.innerHeight ? y - menuHeight : y,
    left: x + menuWidth  > window.innerWidth  ? x - menuWidth  : x,
  }

  const submitAnnotate = () => {
    if (color !== storedColor) setCallbackAnnotation(cb.display_id, color)
    if (desc !== (cb.description ?? '')) {
      updateDesc({ variables: { callback_display_id: cb.display_id, description: desc } })
    }
    onClose()
  }

  const submitExit = () => {
    createTask({ variables: {
      callback_id:       cb.display_id,
      command:           'exit',
      params:            '',
      tasking_location:  'command_line',
    }})
    onClose()
  }

  if (view === 'annotate') {
    return (
      <div
        ref={menuRef}
        className={`${styles.menu} ${styles.menuWide}`}
        style={style}
        onContextMenu={e => e.preventDefault()}
      >
        <div className={styles.editLabel}>Annotate #{cb.display_id} · {cb.host}</div>

        <div className={styles.swatchRow}>
          {ANNOT_SWATCHES.map((c) => (
            <button
              key={c}
              className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          {/* Free color input */}
          <label className={styles.colorPickWrap} title="Custom color">
            <input
              type="color"
              className={styles.colorPick}
              value={color || '#888888'}
              onChange={e => setColor(e.target.value)}
            />
            <span className={styles.colorPickIcon} style={color && !ANNOT_SWATCHES.includes(color as typeof ANNOT_SWATCHES[number]) ? { background: color, borderColor: 'rgba(255,255,255,0.7)' } : {}}>+</span>
          </label>
          <button
            className={`${styles.swatch} ${styles.swatchClear} ${!color ? styles.swatchClearActive : ''}`}
            onClick={() => setColor('')}
            title="Clear"
          >✕</button>
        </div>

        <textarea
          className={styles.editInput}
          placeholder="Note (optional)…"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          autoFocus
          rows={2}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnnotate() }
          }}
        />
        <div className={styles.editActions}>
          <button className={styles.btnSave} onClick={submitAnnotate}>Save</button>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }

  if (view === 'confirmExit') {
    return (
      <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
        <div className={styles.editLabel}>Exit #{cb.display_id} {cb.host}?</div>
        <div className={styles.confirmText}>This will task the agent to terminate.</div>
        <div className={styles.editActions}>
          <button className={`${styles.btnSave} ${styles.btnExit}`} onClick={submitExit}>Exit</button>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
      <div className={styles.header}>#{cb.display_id} {cb.host}</div>

      <button className={styles.item} onClick={() => setView('annotate')}>
        Annotate callback
      </button>

      <button className={styles.item} onClick={() => {
        cb.locked
          ? unlockCb({ variables: { callback_display_id: cb.display_id } })
          : lockCb({   variables: { callback_display_id: cb.display_id } })
        onClose()
      }}>
        {cb.locked ? 'Unlock callback' : 'Lock callback'}
      </button>

      <div className={styles.divider} />

      <button className={`${styles.item} ${styles.danger}`} onClick={() => setView('confirmExit')}>
        Exit callback
      </button>

      <button className={`${styles.item} ${styles.danger}`} onClick={() => {
        hideCb({ variables: { callback_display_id: cb.display_id } })
        onClose()
      }}>
        Hide callback
      </button>
    </div>
  )
}
