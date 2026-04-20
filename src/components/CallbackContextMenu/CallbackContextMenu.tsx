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
import type { Callback } from '@/store'
import styles from './CallbackContextMenu.module.css'

interface Props {
  cb: Callback
  x: number
  y: number
  onClose: () => void
}

type View = 'menu' | 'editDesc' | 'confirmExit'

export function CallbackContextMenu({ cb, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [view, setView]   = useState<View>('menu')
  const [desc, setDesc]   = useState(cb.description)

  const [updateDesc] = useMutation(UPDATE_CALLBACK_DESCRIPTION)
  const [lockCb]     = useMutation(LOCK_CALLBACK)
  const [unlockCb]   = useMutation(UNLOCK_CALLBACK)
  const [hideCb]     = useMutation(HIDE_CALLBACK)
  const [createTask] = useMutation(CREATE_TASK)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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

  const menuHeight = view === 'editDesc' ? 140 : view === 'confirmExit' ? 100 : 170
  const style: React.CSSProperties = {
    position: 'fixed',
    top:  y + menuHeight > window.innerHeight ? y - menuHeight : y,
    left: x + 180        > window.innerWidth  ? x - 180        : x,
  }

  const submitDesc = () => {
    updateDesc({ variables: { callback_display_id: cb.display_id, description: desc } })
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

  if (view === 'editDesc') {
    return (
      <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
        <div className={styles.editLabel}>Description</div>
        <textarea
          className={styles.editInput}
          value={desc}
          onChange={e => setDesc(e.target.value)}
          autoFocus
          rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDesc() } }}
        />
        <div className={styles.editActions}>
          <button className={styles.btnSave} onClick={submitDesc}>Save</button>
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

      <button className={styles.item} onClick={() => setView('editDesc')}>
        Edit description
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
