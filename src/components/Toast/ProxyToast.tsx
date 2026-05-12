/* hecate/src/components/Toast/ProxyToast.tsx */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import type { ProxyToast } from '@/store'
import styles from './ProxyToast.module.css'

const DURATION = 12000

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  })
}

function Toast({ toast }: { toast: ProxyToast }) {
  const { removeProxyToast, setActiveRailView } = useStore()
  const [exiting,  setExiting]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSocks = toast.portType === 'socks'
  const configLine = isSocks
    ? `socks5  127.0.0.1  ${toast.localPort}`
    : `${toast.localPort} → ${toast.remoteIp}:${toast.remotePort}`

  const dismiss = () => {
    setExiting(true)
    setTimeout(() => removeProxyToast(toast.id), 300)
  }

  const navigate = () => {
    setActiveRailView('proxies')
    dismiss()
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyText(configLine)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(dismiss, DURATION)
    }
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
      title="Open Proxies panel"
    >
      <div className={styles.accentBar} />
      <div className={styles.body}>

        {/* Header */}
        <div className={styles.header}>
          <span className={styles.dot} />
          <span className={styles.label}>
            {isSocks ? 'SOCKS5 PROXY' : 'PORT FORWARD'}
          </span>
          <button
            className={styles.close}
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            title="Dismiss"
          >✕</button>
        </div>

        {/* Port number */}
        <div className={styles.port}>:{toast.localPort}</div>

        {/* Callback meta */}
        <div className={styles.meta}>
          <span className={styles.host}>{toast.callbackHost}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.displayId}>#{toast.callbackDisplayId}</span>
          <span className={styles.sep}>·</span>
          <span className={styles.agent}>{toast.agent}</span>
        </div>

        {/* Config line + copy */}
        <div className={styles.configRow} onClick={e => e.stopPropagation()}>
          <code className={styles.configLine}>{configLine}</code>
          <button
            className={`${styles.copyBtn} ${copied ? styles.copyDone : ''}`}
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? '✓' : 'copy'}
          </button>
        </div>

        {isSocks && (
          <div className={styles.hint}>proxychains.conf · [ProxyList]</div>
        )}

        <div className={styles.progress}>
          <div className={styles.progressBar} style={{ animationDuration: `${DURATION}ms` }} />
        </div>
      </div>
    </div>
  )
}

export function ProxyToastContainer() {
  const proxyToasts = useStore((s) => s.proxyToasts)
  if (!proxyToasts.length) return null

  return (
    <div className={styles.container} aria-live="polite">
      {proxyToasts.map(t => <Toast key={t.id} toast={t} />)}
    </div>
  )
}
