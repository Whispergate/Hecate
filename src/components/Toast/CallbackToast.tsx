/* ═══════════════════════════════════════════════════
   hecate/src/components/Toast/CallbackToast.tsx
   ═══════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react'
import { useStore, CallbackToast } from '@/store'
import styles from './CallbackToast.module.css'

const DURATION = 4500

function Toast({ toast }: { toast: CallbackToast }) {
  const { removeToast, setActiveRailView, setSelectedCallbackId } = useStore()
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => removeToast(toast.id), 300)
  }

  const navigate = () => {
    setActiveRailView('callbacks')
    setSelectedCallbackId(toast.callbackId)
    dismiss()
  }

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, DURATION)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return (
    <div
      className={`${styles.toast} ${exiting ? styles.exit : styles.enter}`}
      onClick={navigate}
      role="alert"
      title="Jump to callback"
    >
      <div className={styles.accentBar} />
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.dot} />
          <span className={styles.label}>NEW CALLBACK</span>
          <span className={styles.displayId}>#{toast.display_id}</span>
          <button
            className={styles.close}
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            aria-label="Dismiss"
            title="Dismiss"
          >✕</button>
        </div>
        <div className={styles.host}>{toast.host}</div>
        <div className={styles.meta}>
          <span className={styles.user}>{toast.user || 'unknown'}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.agent}>{toast.agent}</span>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressBar} style={{ animationDuration: `${DURATION}ms` }} />
        </div>
      </div>
    </div>
  )
}

export function CallbackToastContainer() {
  const toasts = useStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  )
}
