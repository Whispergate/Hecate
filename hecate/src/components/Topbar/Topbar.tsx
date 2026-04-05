/* ═══════════════════════════════════════════════════
   hecate/src/components/Topbar/Topbar.tsx
   ═══════════════════════════════════════════════════ */

import { WgSigil } from '../shared/WgSigil'
import { useStore } from '@/store'
import { mythicLogout } from '@/apollo/client'
import styles from './Topbar.module.css'

export function Topbar() {
  const { activeOperation, token, setToken } = useStore()

  function handleLogout() {
    mythicLogout()
    setToken(null)
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.logo}>
        <WgSigil size={26} />
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
          <button className={styles.userDot} onClick={handleLogout} title="Logout">
            OP
          </button>
        )}
      </div>
    </header>
  )
}
