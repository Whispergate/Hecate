/* ═══════════════════════════════════════════════════
   src/components/CredentialsPanel/CredentialsPanel.tsx

   Full-panel credential vault. Lists all credentials
   for the active operation with search, type filtering,
   add/edit/delete, and masked reveal.
   ═══════════════════════════════════════════════════ */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useSubscription, useMutation }            from '@apollo/client'
import {
  GET_CREDENTIALS, SUB_CREDENTIALS,
  CREATE_CREDENTIAL, UPDATE_CREDENTIAL, DELETE_CREDENTIAL,
} from '@/apollo/operations'
import { parseTs } from '@/components/Sidebar/utils'
import styles      from './CredentialsPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface Credential {
  id:              number
  type:            string
  account:         string
  realm:           string
  credential_text: string | null
  comment:         string
  metadata:        string
  timestamp:       string
  deleted:         boolean
  operator:        { username: string }
  task:            { display_id: number; callback: { host: string; display_id: number } } | null
}

// ── Helpers ───────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  hash:        'var(--crimson-400)',
  plaintext:   '#6aaa64',
  certificate: '#6b8fd4',
  key:         '#d4916b',
  ticket:      '#b06bd4',
  cookie:      '#4ec9b0',
}

function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? 'var(--bone-600)'
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - parseTs(iso).getTime()
  if (diff < 60_000)      return 'just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  return parseTs(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function maskCredential(val: string): string {
  if (!val) return '—'
  return '•'.repeat(Math.min(val.length, 36)) + (val.length > 36 ? '…' : '')
}

const KNOWN_TYPES = ['hash', 'plaintext', 'certificate', 'key', 'ticket', 'cookie']

// ── AddModal ──────────────────────────────────────────

interface AddModalProps {
  loading: boolean
  onClose: () => void
  onAdd:   (form: CredForm) => void
}

interface CredForm {
  type:            string
  account:         string
  realm:           string
  credential_text: string
  comment:         string
  metadata:        string
}

function AddModal({ loading, onClose, onAdd }: AddModalProps) {
  const [form, setForm] = useState<CredForm>({
    type: 'hash', account: '', realm: '', credential_text: '', comment: '', metadata: '',
  })

  function set(k: keyof CredForm, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.account.trim() || !form.credential_text.trim()) return
    onAdd(form)
  }

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Add Credential</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.fieldLabel}>Type</label>
          <select className={styles.fieldInput} value={form.type} onChange={e => set('type', e.target.value)}>
            {KNOWN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className={styles.fieldLabel}>Account *</label>
          <input
            className={styles.fieldInput}
            value={form.account}
            onChange={e => set('account', e.target.value)}
            placeholder="username"
            required
            autoFocus
          />

          <label className={styles.fieldLabel}>Realm</label>
          <input
            className={styles.fieldInput}
            value={form.realm}
            onChange={e => set('realm', e.target.value)}
            placeholder="domain or host"
          />

          <label className={styles.fieldLabel}>Credential *</label>
          <textarea
            className={`${styles.fieldInput} ${styles.fieldTextarea}`}
            value={form.credential_text}
            onChange={e => set('credential_text', e.target.value)}
            placeholder="hash, password, key…"
            required
            rows={3}
          />

          <label className={styles.fieldLabel}>Comment</label>
          <input
            className={styles.fieldInput}
            value={form.comment}
            onChange={e => set('comment', e.target.value)}
            placeholder="optional"
          />

          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CredentialRow ─────────────────────────────────────

interface RowProps {
  cred:     Credential
  selected: boolean
  onClick:  () => void
}

function CredentialRow({ cred, selected, onClick }: RowProps) {
  const preview = (cred.credential_text ?? '').slice(0, 30)
  const identity = cred.account + (cred.realm ? `@${cred.realm}` : '')

  return (
    <button
      className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.rowTop}>
        <span className={styles.typeBadge} style={{ color: typeColor(cred.type) }}>
          {cred.type}
        </span>
        <span className={styles.rowAccount}>{identity}</span>
      </div>
      <div className={styles.rowBottom}>
        <span className={styles.rowPreview}>{preview || '—'}</span>
        <span className={styles.rowTs}>{fmtAgo(cred.timestamp)}</span>
      </div>
    </button>
  )
}

// ── CredentialDetail ──────────────────────────────────

interface DetailProps {
  cred:     Credential
  onUpdate: (c: Credential) => void
  onDelete: (id: number) => void
}

function CredentialDetail({ cred, onUpdate, onDelete }: DetailProps) {
  const [editing,       setEditing]      = useState(false)
  const [revealed,      setRevealed]     = useState(false)
  const [editRevealed,  setEditRevealed] = useState(false)
  const [copied,        setCopied]       = useState(false)
  const [form, setForm] = useState<CredForm>({
    type:            cred.type,
    account:         cred.account,
    realm:           cred.realm,
    credential_text: cred.credential_text ?? '',
    comment:         cred.comment,
    metadata:        cred.metadata,
  })

  // Sync form when cred prop updates (e.g. after successful save)
  useEffect(() => {
    setForm({
      type:            cred.type,
      account:         cred.account,
      realm:           cred.realm,
      credential_text: cred.credential_text ?? '',
      comment:         cred.comment,
      metadata:        cred.metadata,
    })
    setEditing(false)
    setRevealed(false)
    setEditRevealed(false)
  }, [cred.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(k: keyof CredForm, v: string) { setForm(p => ({ ...p, [k]: v })) }

  const [updateCred, { loading: updating }] = useMutation(UPDATE_CREDENTIAL)
  const [deleteCred, { loading: deleting }] = useMutation(DELETE_CREDENTIAL)

  async function handleSave() {
    const res = await updateCred({
      variables: {
        id:         cred.id,
        type:       form.type,
        account:    form.account,
        realm:      form.realm,
        credential: form.credential_text,
        comment:    form.comment,
        metadata:   form.metadata,
      },
    })
    const updated = res.data?.update_credential_by_pk
    if (updated) { onUpdate(updated); setEditing(false) }
  }

  async function handleDelete() {
    if (!confirm(`Delete credential for ${cred.account}?`)) return
    await deleteCred({ variables: { id: cred.id } })
    onDelete(cred.id)
  }

  function handleCopy() {
    navigator.clipboard.writeText(cred.credential_text ?? '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const credVal    = cred.credential_text ?? ''
  const displayVal = revealed ? credVal : maskCredential(credVal)

  // Deduplicate type options in edit select
  const typeOptions = Array.from(new Set([...KNOWN_TYPES, form.type]))

  return (
    <div className={styles.detail}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <span className={styles.detailAccount}>{cred.account}</span>
          {cred.realm && <span className={styles.detailRealm}>@{cred.realm}</span>}
        </div>
        <span
          className={styles.detailTypeBadge}
          style={{ color: typeColor(cred.type), borderColor: typeColor(cred.type) }}
        >
          {cred.type}
        </span>
      </div>

      {/* Credential value */}
      <div className={styles.credBlock}>
        <div className={styles.credLabelRow}>
          <span className={styles.credLabel}>CREDENTIAL</span>
          {editing && (
            <button className={styles.credBtn} onClick={() => setEditRevealed(r => !r)}>
              {editRevealed ? 'Hide' : 'Show'}
            </button>
          )}
        </div>

        {editing ? (
          <input
            className={styles.fieldInput}
            type={editRevealed ? 'text' : 'password'}
            value={form.credential_text}
            onChange={e => set('credential_text', e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <>
            <div className={styles.credValue}>{displayVal}</div>
            <div className={styles.credActions}>
              <button className={styles.credBtn} onClick={() => setRevealed(r => !r)}>
                {revealed ? 'Hide' : 'Show'}
              </button>
              <button className={styles.credBtn} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Edit fields or metadata */}
      {editing ? (
        <div className={styles.editForm}>
          <label className={styles.fieldLabel}>Type</label>
          <select className={styles.fieldInput} value={form.type} onChange={e => set('type', e.target.value)}>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className={styles.fieldLabel}>Account</label>
          <input className={styles.fieldInput} value={form.account} onChange={e => set('account', e.target.value)} />

          <label className={styles.fieldLabel}>Realm</label>
          <input className={styles.fieldInput} value={form.realm} onChange={e => set('realm', e.target.value)} />

          <label className={styles.fieldLabel}>Comment</label>
          <input className={styles.fieldInput} value={form.comment} onChange={e => set('comment', e.target.value)} />

          <label className={styles.fieldLabel}>Metadata</label>
          <input className={styles.fieldInput} value={form.metadata} onChange={e => set('metadata', e.target.value)} />

          <div className={styles.editActions}>
            <button className={styles.btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={updating}>
              {updating ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.metaGrid}>
          {cred.task && (
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>Source</span>
              <span className={styles.metaVal}>
                task #{cred.task.display_id} on {cred.task.callback.host}
              </span>
            </div>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>Operator</span>
            <span className={styles.metaVal}>{cred.operator?.username ?? '—'}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaKey}>Captured</span>
            <span className={styles.metaVal}>
              {parseTs(cred.timestamp).toLocaleString([], { hour12: false })}
            </span>
          </div>
          {cred.comment && (
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>Comment</span>
              <span className={styles.metaVal}>{cred.comment}</span>
            </div>
          )}
          {cred.metadata && (
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>Metadata</span>
              <span className={styles.metaVal}>{cred.metadata}</span>
            </div>
          )}
        </div>
      )}

      {/* Action bar */}
      {!editing && (
        <div className={styles.detailActions}>
          <button className={styles.btnSecondary} onClick={() => setEditing(true)}>Edit</button>
          <button className={styles.btnDanger} onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── CredentialsPanel ──────────────────────────────────

export function CredentialsPanel() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [selected,    setSelected]    = useState<number | null>(null)
  const [query,       setQuery]       = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [showAdd,     setShowAdd]     = useState(false)
  const nowRef = useRef(new Date().toISOString())

  const { loading, refetch } = useQuery(GET_CREDENTIALS, {
    onCompleted: data => {
      if (data?.credential) setCredentials(data.credential)
    },
  })

  useSubscription(SUB_CREDENTIALS, {
    variables: { now: nowRef.current },
    onData: ({ data }) => {
      const incoming: Credential[] = data.data?.credential_stream ?? []
      if (!incoming.length) return
      setCredentials(prev => {
        const map = new Map(prev.map(c => [c.id, c]))
        incoming.forEach(c => {
          if (c.deleted) map.delete(c.id)
          else           map.set(c.id, c)
        })
        return Array.from(map.values())
          .sort((a, b) => parseTs(b.timestamp).getTime() - parseTs(a.timestamp).getTime())
      })
    },
  })

  const [createCred, { loading: inserting }] = useMutation(CREATE_CREDENTIAL)

  // Build type pill list from actual data
  const allTypes = useMemo(
    () => ['all', ...Array.from(new Set(credentials.map(c => c.type)))],
    [credentials],
  )

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    credentials.forEach(c => { counts[c.type] = (counts[c.type] ?? 0) + 1 })
    return counts
  }, [credentials])

  const filtered = useMemo(() => {
    let list = credentials
    if (typeFilter !== 'all') list = list.filter(c => c.type === typeFilter)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(c =>
        c.account.toLowerCase().includes(q) ||
        c.realm.toLowerCase().includes(q) ||
        (c.credential_text ?? '').toLowerCase().includes(q) ||
        c.comment.toLowerCase().includes(q),
      )
    }
    return list
  }, [credentials, typeFilter, query])

  const selectedCred = selected !== null
    ? credentials.find(c => c.id === selected) ?? null
    : null

  const handleAdd = useCallback(async (form: CredForm) => {
    const res = await createCred({
      variables: {
        credential_type: form.type,
        account:         form.account,
        realm:           form.realm,
        credential:      form.credential_text,
        comment:         form.comment,
      },
    })
    const result = res.data?.createCredential
    if (result?.status === 'success') {
      setShowAdd(false)
      const fresh = await refetch()
      if (fresh.data?.credential) setCredentials(fresh.data.credential)
    }
  }, [createCred, refetch])

  const handleUpdate = useCallback((updated: Credential) => {
    setCredentials(prev => prev.map(c => c.id === updated.id ? updated : c))
  }, [])

  const handleDelete = useCallback((id: number) => {
    setCredentials(prev => prev.filter(c => c.id !== id))
    setSelected(null)
  }, [])

  return (
    <div className={styles.panel}>
      {/* ── LEFT PANE ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>
            Credentials
            <span className={styles.count}>{credentials.length}</span>
          </span>
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>+ Add</button>
        </div>

        {/* Type filter pills */}
        <div className={styles.typeFilters}>
          {allTypes.map(t => (
            <button
              key={t}
              className={`${styles.typePill} ${typeFilter === t ? styles.typePillActive : ''}`}
              style={
                t !== 'all' && typeFilter === t
                  ? { color: typeColor(t), borderColor: typeColor(t) }
                  : undefined
              }
              onClick={() => setTypeFilter(t)}
            >
              {t}
              {t !== 'all' && typeCounts[t] != null && (
                <span className={styles.pillCount}>{typeCounts[t]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            placeholder="/ search credentials…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setQuery('')}
            spellCheck={false}
          />
        </div>

        {/* List */}
        <div className={styles.list}>
          {loading ? (
            <div className={styles.empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              {query || typeFilter !== 'all' ? 'No matches' : 'No credentials yet'}
            </div>
          ) : (
            filtered.map(cred => (
              <CredentialRow
                key={cred.id}
                cred={cred}
                selected={selected === cred.id}
                onClick={() => setSelected(cred.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT PANE ── */}
      <div className={styles.detailPane}>
        {selectedCred ? (
          <CredentialDetail
            key={selectedCred.id}
            cred={selectedCred}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <div className={styles.empty}>Select a credential to view details</div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <AddModal
          loading={inserting}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}
    </div>
  )
}
