/* ═══════════════════════════════════════════════════
   hecate/src/components/Topbar/Topbar.tsx
   ═══════════════════════════════════════════════════ */

import { useState }     from 'react'
import logoImg          from '@/assets/logo.png'
import { useStore }     from '@/store'
import { mythicLogout } from '@/apollo/client'
import styles           from './Topbar.module.css'

export function Topbar() {
  const { activeOperation, setActiveOperation, token, setToken } = useStore()
  const [menuOpen, setMenuOpen] = useState(false)

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
