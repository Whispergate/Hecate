/* ═══════════════════════════════════════════════════
   hecate/src/views/OperationSelect.tsx
   Uses raw fetch (not Apollo) to avoid WS issues on init.
   Operation switch calls updateCurrentOperation mutation
   so Mythic updates Hasura claims server-side.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useStore }                   from '@/store'
import { apolloClient, resetWsLink } from '@/apollo/client'
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

const UPDATE_OP_MUTATION = `
  mutation UpdateCurrentOperation($user_id: Int!, $operation_id: Int!) {
    updateCurrentOperation(user_id: $user_id, operation_id: $operation_id) {
      status
      error
      operation_id
      name
    }
  }
`

export function OperationSelect() {
  const { setActiveOperation, setToken, userId, setUserId } = useStore()
  const [ops, setOps]             = useState<Operation[]>([])
  const [loading, setLoading]     = useState(true)
  const [switching, setSwitching] = useState<number | null>(null)
  const [error, setError]         = useState('')

  async function gql(query: string, variables?: Record<string, unknown>) {
    const token = sessionStorage.getItem('hecate_token') ?? ''
    const res = await fetch('/graphql/', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json()
    if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error')
    return json.data
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await gql(QUERY)
      setOps(data?.operation ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Resolve user_id from store or fall back to JWT payload decode
  function resolveUserId(): number | null {
    if (userId) return userId
    try {
      const token = sessionStorage.getItem('hecate_token') ?? ''
      const payload = JSON.parse(atob(token.split('.')[1]))
      const id = payload.user_id ?? null
      if (id) setUserId(id)   // backfill store + sessionStorage
      return id
    } catch {
      return null
    }
  }

  async function handlePick(op: Operation) {
    setSwitching(op.id)
    setError('')

    try {
      // Tell Mythic to switch the active operation server-side.
      // This updates operator.current_operation_id in the DB and
      // calls UpdateHasuraClaims so the new operation's RLS is active.
      const uid = resolveUserId()
      if (!uid) {
        setError('Cannot determine user ID — please log out and back in')
        setSwitching(null)
        return
      }

      const data = await gql(UPDATE_OP_MUTATION, {
        user_id:      uid,
        operation_id: op.id,
      })
      const result = data?.updateCurrentOperation
      if (result?.status !== 'success') {
        setError(result?.error ?? 'Failed to switch operation')
        setSwitching(null)
        return
      }

      // Restart WS so next subscription reconnects with updated Hasura claims.
      // Clear Apollo cache so no stale data from the previous operation bleeds through.
      resetWsLink()
      await apolloClient.clearStore()
      setActiveOperation({ id: op.id, name: op.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to switch operation')
      setSwitching(null)
    }
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
              disabled={switching !== null}
            >
              <div className={styles.opName}>
                {switching === op.id ? 'switching…' : op.name}
              </div>
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
