/* ═══════════════════════════════════════════════════
   hecate/src/views/OperationSelect.tsx
   Uses raw fetch (not Apollo) to avoid WS issues on init.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useStore }     from '@/store'
import { WgSigil }      from '@/components/shared/WgSigil'
import styles           from './OperationSelect.module.css'

interface Operation {
  id: number
  name: string
  complete: boolean
  admin: { username: string }
}

const QUERY = `
  query GetOperations {
    operation(order_by: { name: asc }) {
      id
      name
      complete
      admin { username }
    }
  }
`

export function OperationSelect() {
  const { setActiveOperation, setToken } = useStore()
  const [ops, setOps]         = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const token = sessionStorage.getItem('hecate_token') ?? ''
      const res = await fetch('/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: QUERY }),
      })
      const json = await res.json()
      if (json.errors) {
        console.error('[OperationSelect] GraphQL errors:', json.errors)
        setError(json.errors[0]?.message ?? 'GraphQL error')
      } else {
        setOps(json.data?.operation ?? [])
      }
    } catch (e) {
      console.error('[OperationSelect] fetch failed:', e)
      setError('Network error — check proxy/Mythic connection')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handlePick(op: Operation) {
    setActiveOperation({ id: op.id, name: op.name })
  }

  function handleLogout() {
    sessionStorage.removeItem('hecate_token')
    setToken(null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <WgSigil size={40} />
          <h1 className={styles.title}>Select Operation</h1>
          <p className={styles.subtitle}>choose your operational context</p>
        </div>

        {loading && <div className={styles.loading}>Fetching operations…</div>}

        {error && !loading && (
          <div className={styles.error}>
            {error}
            <button className={styles.retry} onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && ops.length === 0 && (
          <div className={styles.empty}>
            No operations found. Create one in Mythic first.
          </div>
        )}

        <div className={styles.list}>
          {ops.map(op => (
            <button
              key={op.id}
              className={`${styles.opItem} ${op.complete ? styles.complete : ''}`}
              onClick={() => handlePick(op)}
            >
              <div className={styles.opName}>{op.name}</div>
              <div className={styles.opMeta}>
                admin: {op.admin?.username ?? '—'}
                {op.complete && (
                  <span className={styles.completeBadge}>complete</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <button className={styles.logout} onClick={handleLogout}>
          ← logout
        </button>
      </div>
    </div>
  )
}
