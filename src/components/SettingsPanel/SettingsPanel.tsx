/* ═══════════════════════════════════════════════════
   hecate/src/components/SettingsPanel/SettingsPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  GET_API_TOKENS, CREATE_API_TOKEN, DELETE_API_TOKEN, CHANGE_PASSWORD,
  GET_OPERATORS, CREATE_OPERATOR, UPDATE_OPERATOR_STATUS,
  UPDATE_OPERATOR_USERNAME, UPDATE_OPERATOR_CREDENTIALS,
} from '@/apollo/operations'
import { useStore, DEFAULT_SETTINGS, HecateSettings } from '@/store'
import styles from './SettingsPanel.module.css'

// ── Primitive controls ─────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.toggleSlider} />
    </label>
  )
}

function Seg<T extends string>({
  options, value, onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className={styles.seg}>
      {options.map((o) => (
        <button
          key={o.value}
          className={`${styles.segBtn} ${value === o.value ? styles.segActive : ''}`}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.rowTitle}>{label}</span>
        {sub && <span className={styles.rowSub}>{sub}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className="sec-label">{title}</div>
      {children}
    </div>
  )
}

// ── Appearance ─────────────────────────────────────────────

function AppearanceSection() {
  const { theme, setTheme, settings, updateSettings } = useStore()

  return (
    <Section title="Appearance">
      <Row label="Theme">
        <Seg
          options={[
            { label: 'Dark',  value: 'dark'  },
            { label: 'Light', value: 'light' },
            { label: 'Ember', value: 'ember' },
            { label: 'Abyss', value: 'abyss' },
            { label: 'Sage',  value: 'sage'  },
          ]}
          value={theme}
          onChange={setTheme}
        />
      </Row>
      <Row label="Font size">
        <Seg
          options={[
            { label: 'S', value: 'small' },
            { label: 'M', value: 'normal' },
            { label: 'L', value: 'large' },
          ]}
          value={settings.fontSize}
          onChange={(v) => updateSettings({ fontSize: v as HecateSettings['fontSize'] })}
        />
      </Row>
    </Section>
  )
}

// ── Notifications ──────────────────────────────────────────

function NotificationsSection() {
  const { settings, updateSettings } = useStore()

  return (
    <Section title="Notifications">
      <Row label="Callback alerts" sub="Toast on new callback">
        <Toggle
          checked={settings.toastsEnabled}
          onChange={(v) => updateSettings({ toastsEnabled: v })}
        />
      </Row>
      <Row label="Alert duration">
        <Seg
          options={[
            { label: '2s', value: '2000' },
            { label: '4s', value: '4500' },
            { label: '8s', value: '8000' },
          ]}
          value={String(settings.toastDuration)}
          onChange={(v) => updateSettings({ toastDuration: Number(v) })}
        />
      </Row>
    </Section>
  )
}

// ── Callbacks ─────────────────────────────────────────────

const ALIVE_OPTIONS = [
  { label: '30s', value: '30000'  },
  { label: '1m',  value: '60000'  },
  { label: '2m',  value: '120000' },
  { label: '5m',  value: '300000' },
]
const IDLE_OPTIONS = [
  { label: '5m',  value: '300000'  },
  { label: '10m', value: '600000'  },
  { label: '30m', value: '1800000' },
]

function CallbacksSection() {
  const { settings, updateSettings } = useStore()

  return (
    <Section title="Callbacks">
      <Row label="Alive threshold" sub="Green pulsing status">
        <Seg
          options={ALIVE_OPTIONS}
          value={String(settings.callbackAliveMs)}
          onChange={(v) => updateSettings({ callbackAliveMs: Number(v) })}
        />
      </Row>
      <Row label="Idle threshold" sub="Yellow status cutoff">
        <Seg
          options={IDLE_OPTIONS}
          value={String(settings.callbackIdleMs)}
          onChange={(v) => updateSettings({ callbackIdleMs: Number(v) })}
        />
      </Row>
      <Row label="Show display ID" sub="Show #N next to hostname">
        <Toggle
          checked={settings.showCallbackDisplayId}
          onChange={(v) => updateSettings({ showCallbackDisplayId: v })}
        />
      </Row>
    </Section>
  )
}

// ── Password change ────────────────────────────────────────

function PasswordSection() {
  const [oldPw,  setOldPw]  = useState('')
  const [newPw,  setNewPw]  = useState('')
  const [confPw, setConfPw] = useState('')
  const [err,    setErr]    = useState('')
  const [ok,     setOk]     = useState(false)

  const [changePassword, { loading }] = useMutation(CHANGE_PASSWORD, {
    onCompleted: (data) => {
      if (data.updatePasswordAndEmail?.status === 'success') {
        setOk(true); setOldPw(''); setNewPw(''); setConfPw(''); setErr('')
      } else {
        setErr(data.updatePasswordAndEmail?.error || 'Failed')
      }
    },
    onError: (e) => setErr(e.message),
  })

  function submit() {
    setOk(false); setErr('')
    if (!oldPw || !newPw) { setErr('All fields required'); return }
    if (newPw !== confPw) { setErr('Passwords do not match'); return }
    if (newPw.length < 8) { setErr('Min 8 characters'); return }
    changePassword({ variables: { old_password: oldPw, new_password: newPw } })
  }

  return (
    <Section title="Change password">
      <div className={styles.form}>
        <input
          className={styles.input}
          type="password"
          placeholder="Current password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          autoComplete="current-password"
        />
        <input
          className={styles.input}
          type="password"
          placeholder="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
        />
        <input
          className={styles.input}
          type="password"
          placeholder="Confirm new password"
          value={confPw}
          onChange={(e) => setConfPw(e.target.value)}
          autoComplete="new-password"
        />
        {err && <div className={styles.formErr}>{err}</div>}
        {ok  && <div className={styles.formOk}>Password updated</div>}
        <button className={`btn btn--primary ${styles.submitBtn}`} onClick={submit} disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </Section>
  )
}

// ── API Tokens ─────────────────────────────────────────────

interface APIToken { id: number; name: string; active: boolean; token_type: string }

function APITokensSection() {
  const [newName,      setNewName]      = useState('')
  const [createdValue, setCreatedValue] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)

  const { data, refetch, error: queryErr } = useQuery(GET_API_TOKENS, { fetchPolicy: 'network-only' })

  const [createToken, { loading: creating }] = useMutation(CREATE_API_TOKEN, {
    onCompleted: (d) => {
      if (d.createAPIToken?.status === 'success') {
        setCreatedValue(d.createAPIToken.token_value)
        setNewName('')
        refetch()
      }
    },
  })

  const [deleteToken] = useMutation(DELETE_API_TOKEN, {
    onCompleted: () => refetch(),
  })

  function copyToken() {
    if (!createdValue) return
    navigator.clipboard.writeText(createdValue).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tokens: APIToken[] = data?.apitokens ?? []

  return (
    <Section title="API tokens">
      {queryErr && (
        <div className={styles.formErr} style={{ marginBottom: 8 }}>
          Could not load tokens: {queryErr.message}
        </div>
      )}

      {/* New token creation */}
      <div className={styles.tokenCreate}>
        <input
          className={styles.input}
          placeholder="Token name (optional)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createToken({ variables: { token_type: 'User', name: newName || undefined } }) }}
        />
        <button
          className="btn btn--primary"
          onClick={() => createToken({ variables: { token_type: 'User', name: newName || undefined } })}
          disabled={creating}
        >
          {creating ? '…' : '+ Generate'}
        </button>
      </div>

      {/* Newly created token (shown once) */}
      {createdValue && (
        <div className={styles.tokenReveal}>
          <div className={styles.tokenRevealLabel}>
            Token created — copy now, it won't be shown again.
          </div>
          <div className={styles.tokenRevealRow}>
            <code className={styles.tokenValue}>{createdValue}</code>
            <button className="btn" onClick={copyToken}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {tokens.length === 0 && !queryErr && (
        <div className={styles.tokenEmpty}>No tokens yet</div>
      )}
      {tokens.map((t) => (
        <div key={t.id} className={styles.tokenRow}>
          <div className={styles.tokenInfo}>
            <span className={styles.tokenName}>{t.name || `Token #${t.id}`}</span>
            <span className={`${styles.tokenStatus} ${t.active ? styles.tokenActive : styles.tokenInactive}`}>
              {t.active ? 'active' : 'inactive'}
            </span>
          </div>
          <button
            className={styles.tokenDelete}
            onClick={() => deleteToken({ variables: { apitokens_id: t.id } })}
            title="Delete token"
          >
            ✕
          </button>
        </div>
      ))}
    </Section>
  )
}

// ── Operators ──────────────────────────────────────────────

interface Operator {
  id: number
  username: string
  email: string | null
  active: boolean
  admin: boolean
  deleted: boolean
  last_login: string | null
  account_type: string
  operation: { id: number; name: string } | null
}

function OperatorRow({
  op, isMe, currentUserIsAdmin, onToggleActive, onToggleAdmin, onToggleDeleted,
}: {
  op: Operator
  isMe: boolean
  currentUserIsAdmin: boolean
  onToggleActive: (id: number, v: boolean) => void
  onToggleAdmin: (id: number, v: boolean) => void
  onToggleDeleted: (id: number, v: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newUsername, setNewUsername] = useState(op.username)
  const [newEmail,    setNewEmail]    = useState(op.email ?? '')
  const [newPw,       setNewPw]       = useState('')
  const [savingEdit,  setSavingEdit]  = useState(false)
  const [editErr,     setEditErr]     = useState('')

  const [updateUsername] = useMutation(UPDATE_OPERATOR_USERNAME)
  const [updateCreds]    = useMutation(UPDATE_OPERATOR_CREDENTIALS)

  function handleSave() {
    setEditErr('')
    setSavingEdit(true)
    const tasks: Promise<unknown>[] = []

    if (newUsername !== op.username && newUsername.trim()) {
      tasks.push(updateUsername({ variables: { id: op.id, username: newUsername.trim() } }))
    }
    if (newPw || newEmail !== (op.email ?? '')) {
      tasks.push(updateCreds({
        variables: {
          user_id: op.id,
          new_password: newPw || undefined,
          email: newEmail !== (op.email ?? '') ? newEmail : undefined,
        },
      }))
    }
    Promise.all(tasks)
      .then(() => { setSavingEdit(false); setExpanded(false); setNewPw('') })
      .catch((e) => { setSavingEdit(false); setEditErr(e.message) })
  }

  const canEdit = isMe || currentUserIsAdmin
  const canToggle = currentUserIsAdmin && !isMe

  return (
    <div className={`${styles.opRow} ${op.deleted ? styles.opDeleted : ''}`}>
      <div className={styles.opMain}>
        <div className={styles.opLeft}>
          <span className={`${styles.opName} ${isMe ? styles.opNameMe : ''}`}>{op.username}</span>
          {op.account_type === 'bot' && <span className={styles.opBadge}>BOT</span>}
          {!op.active && !op.deleted && <span className={`${styles.opBadge} ${styles.opBadgeWarn}`}>INACTIVE</span>}
          {op.deleted && <span className={`${styles.opBadge} ${styles.opBadgeErr}`}>DELETED</span>}
        </div>
        <div className={styles.opActions}>
          {currentUserIsAdmin && (
            <>
              <button
                className={`${styles.opToggle} ${op.active ? styles.opToggleOn : ''}`}
                disabled={!canToggle}
                title="Toggle active"
                onClick={() => onToggleActive(op.id, !op.active)}
              >A</button>
              <button
                className={`${styles.opToggle} ${op.admin ? styles.opToggleOn : ''}`}
                disabled={!canToggle || op.account_type === 'bot'}
                title="Toggle admin"
                onClick={() => onToggleAdmin(op.id, !op.admin)}
              >★</button>
            </>
          )}
          {canEdit && (
            <button
              className={`${styles.opAction} ${expanded ? styles.opActionActive : ''}`}
              title="Edit"
              onClick={() => setExpanded((v) => !v)}
            >✎</button>
          )}
          {currentUserIsAdmin && !isMe && (
            <button
              className={`${styles.opAction} ${op.deleted ? styles.opActionRestore : styles.opActionDel}`}
              title={op.deleted ? 'Restore' : 'Delete'}
              onClick={() => onToggleDeleted(op.id, !op.deleted)}
            >{op.deleted ? '↩' : '✕'}</button>
          )}
        </div>
      </div>

      {expanded && (
        <div className={styles.opEdit}>
          {currentUserIsAdmin && (
            <input
              className={styles.input}
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
          )}
          <input
            className={styles.input}
            placeholder="Email (optional)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <input
            className={styles.input}
            type="password"
            placeholder={currentUserIsAdmin && !isMe ? 'New password (admin reset)' : 'New password'}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          {editErr && <div className={styles.formErr}>{editErr}</div>}
          <button className="btn btn--primary" onClick={handleSave} disabled={savingEdit}>
            {savingEdit ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function OperatorsSection() {
  const userId = useStore((s) => s.userId)
  const [operators, setOperators] = useState<Operator[]>([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [creating, setCreating]       = useState(false)
  const [newUser,  setNewUser]        = useState('')
  const [newPass,  setNewPass]        = useState('')
  const [newEmail, setNewEmail]       = useState('')
  const [createErr, setCreateErr]     = useState('')

  useQuery(GET_OPERATORS, {
    fetchPolicy: 'network-only',
    onCompleted: (d) => setOperators(d.operator ?? []),
  })

  const me = operators.find((o) => o.id === userId)
  const isAdmin = me?.admin ?? false

  const [updateStatus] = useMutation(UPDATE_OPERATOR_STATUS, {
    onCompleted: (d) => {
      const r = d.updateOperatorStatus
      if (r.status === 'error') return
      setOperators((prev) => prev.map((o) =>
        o.id === r.id
          ? { ...o,
              active:  r.active  ?? o.active,
              admin:   r.admin   ?? o.admin,
              deleted: r.deleted ?? o.deleted }
          : o,
      ))
    },
  })

  const [createOperator, { loading: creatingOp }] = useMutation(CREATE_OPERATOR, {
    onCompleted: (d) => {
      const op = d.createOperator
      if (op.status === 'success') {
        setOperators((prev) => [...prev, {
          id: op.id, username: op.username, email: op.email ?? null,
          active: op.active, admin: op.admin ?? false, deleted: op.deleted ?? false,
          last_login: null, account_type: op.account_type ?? 'user', operation: null,
        }])
        setCreating(false); setNewUser(''); setNewPass(''); setNewEmail(''); setCreateErr('')
      } else {
        setCreateErr(op.error || 'Failed')
      }
    },
    onError: (e) => setCreateErr(e.message),
  })

  const visible = operators.filter((o) => showDeleted || !o.deleted)

  return (
    <Section title="Operators">
      <div className={styles.opHeader}>
        <button
          className={styles.opShowDeleted}
          onClick={() => setShowDeleted((v) => !v)}
        >
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </button>
        {isAdmin && (
          <button
            className="btn btn--primary"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'Cancel' : '+ New operator'}
          </button>
        )}
      </div>

      {creating && (
        <div className={styles.opCreate}>
          <input className={styles.input} placeholder="Username" value={newUser}
            onChange={(e) => setNewUser(e.target.value)} />
          <input className={styles.input} type="password" placeholder="Password" value={newPass}
            onChange={(e) => setNewPass(e.target.value)} />
          <input className={styles.input} placeholder="Email (optional)" value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)} />
          {createErr && <div className={styles.formErr}>{createErr}</div>}
          <button className="btn btn--primary" disabled={creatingOp || !newUser || !newPass}
            onClick={() => createOperator({ variables: { username: newUser, password: newPass, email: newEmail || undefined } })}>
            {creatingOp ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      <div className={styles.opList}>
        {visible.map((op) => (
          <OperatorRow
            key={op.id}
            op={op}
            isMe={op.id === userId}
            currentUserIsAdmin={isAdmin}
            onToggleActive={(id, v) => updateStatus({ variables: { operator_id: id, active: v } })}
            onToggleAdmin={(id, v) => updateStatus({ variables: { operator_id: id, admin: v } })}
            onToggleDeleted={(id, v) => updateStatus({ variables: { operator_id: id, deleted: v } })}
          />
        ))}
        {visible.length === 0 && (
          <div className={styles.tokenEmpty}>No operators</div>
        )}
      </div>
    </Section>
  )
}

// ── Reset ──────────────────────────────────────────────────

function ResetSection() {
  const { updateSettings, setTheme } = useStore()
  const [confirmed, setConfirmed] = useState(false)

  function handleReset() {
    if (!confirmed) { setConfirmed(true); return }
    updateSettings(DEFAULT_SETTINGS)
    setTheme('dark')
    setConfirmed(false)
  }

  return (
    <Section title="Reset">
      <div className={styles.resetRow}>
        <span className={styles.resetLabel}>
          Reset all settings to defaults
        </span>
        <button
          className={`btn ${confirmed ? styles.resetConfirm : ''}`}
          onClick={handleReset}
        >
          {confirmed ? 'Confirm reset' : 'Reset'}
        </button>
      </div>
    </Section>
  )
}

// ── Main panel ─────────────────────────────────────────────

export function SettingsPanel() {
  const { isSettingsOpen, setSettingsOpen } = useStore()

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSettingsOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setSettingsOpen])

  return (
    <>
      {isSettingsOpen && (
        <div className={styles.backdrop} onClick={() => setSettingsOpen(false)} />
      )}

      <aside className={`${styles.panel} ${isSettingsOpen ? styles.open : ''}`} aria-label="Settings">
        <div className={styles.header}>
          <span className={styles.headerTitle}>Settings</span>
          <button className={styles.closeBtn} onClick={() => setSettingsOpen(false)} aria-label="Close">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <AppearanceSection />
          <NotificationsSection />
          <CallbacksSection />
          <PasswordSection />
          <APITokensSection />
          <OperatorsSection />
          <ResetSection />
        </div>
      </aside>
    </>
  )
}
