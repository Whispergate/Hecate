/* ═══════════════════════════════════════════════════
   hecate/src/views/Login.tsx
   ═══════════════════════════════════════════════════ */

import { useState } from 'react'
import { mythicLogin } from '@/apollo/client'
import { useStore }    from '@/store'
import { WgSigil }     from '@/components/shared/WgSigil'
import styles          from './Login.module.css'

export function Login() {
  const setToken  = useStore((s) => s.setToken)
  const setUserId = useStore((s) => s.setUserId)
  const [user, setUser]     = useState('')
  const [pass, setPass]     = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await mythicLogin(user, pass)
    setLoading(false)
    if (result.success) {
      setUserId(result.userId)
      setToken(sessionStorage.getItem('hecate_token'))
    } else {
      setError('Authentication failed — check credentials or Mythic host')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <WgSigil size={52} />
          <h1 className={styles.title}>HECATE</h1>
          <p className={styles.subtitle}>mythic c2 interface</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Username</label>
            <input
              className={styles.input}
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="mythic_admin"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={`btn btn--primary ${styles.submit}`} type="submit" disabled={loading}>
            {loading ? 'Authenticating…' : 'Enter'}
          </button>
        </form>

        <div className={styles.footer}>
          proxied via nginx → mythic :7443
        </div>
      </div>
    </div>
  )
}
