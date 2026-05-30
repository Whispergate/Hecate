/* ═══════════════════════════════════════════════════
   hecate/src/components/Topbar/Topbar.tsx
   ═══════════════════════════════════════════════════ */

import { useState }     from 'react'
import logoImg          from '@/assets/logo.png'
import { useStore }     from '@/store'
import { mythicLogout } from '@/apollo/client'
import styles           from './Topbar.module.css'

const CONN_META: Record<
  'idle' | 'connecting' | 'connected' | 'disconnected',
  { label: string; cls: string; title: string }
> = {
  idle:         { label: 'idle',         cls: 'connIdle',         title: 'No active subscription to Mythic yet' },
  connecting:   { label: 'connecting',   cls: 'connConnecting',   title: 'Connecting to Mythic…' },
  connected:    { label: 'connected',    cls: 'connConnected',    title: 'Live connection to Mythic (WebSocket open)' },
  disconnected: { label: 'disconnected', cls: 'connDisconnected', title: 'Lost connection to Mythic — retrying' },
}

export function Topbar() {
  const { activeOperation, setActiveOperation, token, setToken, theme, setTheme, mythicConnection } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const conn = CONN_META[mythicConnection]

  function handleLogout() {
    mythicLogout()
    setToken(null)
    setActiveOperation(null)
    setMenuOpen(false)
  }

  function handleSwitchOp() {
    setActiveOperation(null)
    setMenuOpen(false)
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.logo}>
        <img src={logoImg} className={styles.logoImg} alt="WhisperGate" />
        <span className={styles.logoText}>HECATE</span>
      </div>

      <div className={styles.center}>
        whispergate · mythic c2 interface
      </div>

      <div className={styles.right}>
        {activeOperation && (
          <div className={styles.opBadge}>
            Op: <span className={styles.opName}>{activeOperation.name}</span>
          </div>
        )}
        <div className={styles.mythicVersion}>mythic v3 · graphql</div>

        {token && (
          <div className={styles.connIndicator} title={conn.title}>
            <span className={`${styles.connDot} ${styles[conn.cls]}`} />
            <span className={styles.connLabel}>{conn.label}</span>
          </div>
        )}

        <button
          className={styles.themeToggle}
          onClick={() => {
            const order = ['dark', 'light', 'ember', 'abyss', 'sage', 'lavender'] as const
            const next = order[(order.indexOf(theme) + 1) % order.length]
            setTheme(next)
          }}
          title={`Theme: ${theme} (click to cycle)`}
        >
          {theme === 'dark'  ? '☾'
          : theme === 'light' ? '☀'
          : theme === 'ember' ? '✦'
          : theme === 'abyss' ? '✶'
          : theme === 'sage'  ? '❋'
          : '♥'}
        </button>

        {token && (
          <div className={styles.userMenu}>
            <button
              className={styles.userDot}
              onClick={() => setMenuOpen(o => !o)}
              title="User menu"
            >
              OP
            </button>
            {menuOpen && (
              <div className={styles.dropdown}>
                <button className={styles.dropItem} onClick={handleSwitchOp}>
                  Switch operation
                </button>
                <div className={styles.dropSep} />
                <button className={`${styles.dropItem} ${styles.dropDanger}`} onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
