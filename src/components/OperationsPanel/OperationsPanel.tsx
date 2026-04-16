/* ═══════════════════════════════════════════════════
   hecate/src/components/OperationsPanel/OperationsPanel.tsx
   Full-panel operations management: list, settings, member assignment.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import {
  GET_OPERATIONS_WITH_MEMBERS,
  CREATE_OPERATION,
  UPDATE_OPERATION,
  UPDATE_OPERATOR_OPERATION,
  UPDATE_CURRENT_OPERATION,
} from '@/apollo/operations'
import { apolloClient, resetWsLink } from '@/apollo/client'
import { useStore } from '@/store'
import styles from './OperationsPanel.module.css'

// ── Types ──────────────────────────────────────────────────

interface OpOperator {
  id: number
  username: string
  account_type: string
}

interface OperatorOperation {
  id: number
  view_mode: 'operator' | 'spectator' | 'lead'
  operator: OpOperator
}

interface Operation {
  id: number
  name: string
  complete: boolean
  deleted: boolean
  banner_text: string
  banner_color: string
  admin: OpOperator
  operatoroperations: OperatorOperation[]
}

// ── Helpers ────────────────────────────────────────────────

const VIEW_MODE_LABELS: Record<string, string> = {
  lead: 'LEAD',
  operator: 'OP',
  spectator: 'SPEC',
}

// ── OperationDetail ────────────────────────────────────────

function OperationDetail({
  op,
  allOperators,
  currentUserId,
  currentUserIsAdmin,
  activeOperationId,
  onOpUpdated,
  onOpDeleted,
  onSwitched,
}: {
  op: Operation
  allOperators: OpOperator[]
  currentUserId: number | null
  currentUserIsAdmin: boolean
  activeOperationId: number | null
  onOpUpdated: (patch: Partial<Operation> & { id: number }) => void
  onOpDeleted: (id: number, deleted: boolean) => void
  onSwitched: (op: Operation) => void
}) {
  const [editName,    setEditName]    = useState(op.name)
  const [nameErr,     setNameErr]     = useState('')
  const [switching,   setSwitching]   = useState(false)

  // Reset inputs when op changes
  useEffect(() => {
    setEditName(op.name)
    setNameErr('')
  }, [op.id])

  const isCurrentOp = op.id === activeOperationId
  const isLead = op.admin.id === currentUserId
  const canEdit = isLead || currentUserIsAdmin

  // ── Mutations ──

  const [updateOp] = useMutation(UPDATE_OPERATION, {
    onCompleted: (d) => {
      const r = d.updateOperation
      if (r.status !== 'success') { setNameErr(r.error || 'Failed'); return }
      onOpUpdated({ id: op.id, name: r.name, complete: r.complete })
    },
    onError: (e) => setNameErr(e.message),
  })

  const [switchOp] = useMutation(UPDATE_CURRENT_OPERATION, {
    onCompleted: async (d) => {
      const r = d.updateCurrentOperation
      if (r.status !== 'success') { setSwitching(false); return }
      resetWsLink()
      await apolloClient.clearStore()
      onSwitched({ ...op, id: r.operation_id, name: r.name, complete: r.complete })
      setSwitching(false)
    },
    onError: () => setSwitching(false),
  })

  const [updateMember] = useMutation(UPDATE_OPERATOR_OPERATION)
  const [updateOpAdmin] = useMutation(UPDATE_OPERATION)

  // ── Settings handlers ──

  function saveName() {
    const name = editName.trim()
    if (!name) { setNameErr('Name required'); return }
    setNameErr('')
    updateOp({ variables: { operation_id: op.id, name } })
  }

  function toggleComplete() {
    updateOp({ variables: { operation_id: op.id, complete: !op.complete } })
  }

  function toggleDeleted() {
    updateOp({ variables: { operation_id: op.id, deleted: !op.deleted } })
    onOpDeleted(op.id, !op.deleted)
  }

  function handleSwitch() {
    if (!currentUserId) return
    setSwitching(true)
    switchOp({ variables: { user_id: currentUserId, operation_id: op.id } })
  }

  // ── Member handlers ──

  function addMember(operatorId: number) {
    updateMember({
      variables: { operation_id: op.id, add_users: [operatorId], view_mode_operators: [operatorId] },
      onCompleted: () => {
        const op2 = allOperators.find((o) => o.id === operatorId)
        if (!op2) return
        onOpUpdated({
          id: op.id,
          operatoroperations: [
            ...op.operatoroperations,
            { id: Date.now(), view_mode: 'operator', operator: op2 },
          ],
        })
      },
    })
  }

  function removeMember(operatorId: number) {
    updateMember({
      variables: { operation_id: op.id, remove_users: [operatorId] },
      onCompleted: () => {
        onOpUpdated({
          id: op.id,
          operatoroperations: op.operatoroperations.filter((m) => m.operator.id !== operatorId),
        })
      },
    })
  }

  function changeRole(operatorId: number, newRole: 'lead' | 'operator' | 'spectator') {
    if (newRole === 'lead') {
      // Promote to lead: update admin_id, demote old lead to operator
      updateOpAdmin({
        variables: { operation_id: op.id, admin_id: operatorId },
        onCompleted: (d) => {
          if (d.updateOperation.status !== 'success') return
          onOpUpdated({
            id: op.id,
            admin: allOperators.find((o) => o.id === operatorId) ?? op.admin,
            operatoroperations: op.operatoroperations.map((m) =>
              m.operator.id === operatorId
                ? { ...m, view_mode: 'lead' }
                : m.view_mode === 'lead'
                ? { ...m, view_mode: 'operator' }
                : m,
            ),
          })
        },
      })
    } else {
      const vars = newRole === 'operator'
        ? { operation_id: op.id, view_mode_operators: [operatorId] }
        : { operation_id: op.id, view_mode_spectators: [operatorId] }
      updateMember({
        variables: vars,
        onCompleted: () => {
          onOpUpdated({
            id: op.id,
            operatoroperations: op.operatoroperations.map((m) =>
              m.operator.id === operatorId ? { ...m, view_mode: newRole } : m,
            ),
          })
        },
      })
    }
  }

  // Members not yet in this operation
  const memberIds = new Set(op.operatoroperations.map((m) => m.operator.id))
  const unassigned = allOperators.filter((o) => !memberIds.has(o.id))

  // Sort: lead first, then operators, then spectators
  const sortedMembers = [...op.operatoroperations].sort((a, b) => {
    const order = { lead: 0, operator: 1, spectator: 2 }
    return order[a.view_mode] - order[b.view_mode]
  })

  return (
    <div className={styles.detail}>
      {/* Header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          <span className={styles.detailName}>{op.name}</span>
          {isCurrentOp && <span className={styles.currentBadge}>ACTIVE</span>}
          {op.complete && <span className={styles.completeBadge}>COMPLETE</span>}
          {op.deleted && <span className={styles.deletedBadge}>DELETED</span>}
        </div>
        <div className={styles.detailActions}>
          {!isCurrentOp && (
            <button className="btn btn--primary" onClick={handleSwitch} disabled={switching}>
              {switching ? 'Switching…' : '▶ Switch to'}
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className={styles.detailSection}>
        <div className="sec-label">Settings</div>

        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>Name</span>
          <div className={styles.settingControl}>
            <input
              className={styles.nameInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={!canEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName() }}
            />
            {canEdit && editName !== op.name && (
              <button className="btn btn--primary" onClick={saveName}>Save</button>
            )}
          </div>
          {nameErr && <div className={styles.settingErr}>{nameErr}</div>}
        </div>

        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>Status</span>
          <div className={styles.settingControl}>
            <button
              className={`${styles.statusBtn} ${op.complete ? styles.statusComplete : styles.statusActive}`}
              onClick={canEdit ? toggleComplete : undefined}
              disabled={!canEdit}
              title={canEdit ? 'Toggle complete' : undefined}
            >
              {op.complete ? '✓ Complete' : '● Active'}
            </button>
          </div>
        </div>

        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>Lead</span>
          <span className={styles.settingValue}>{op.admin.username}</span>
        </div>

        {op.banner_text && (
          <div className={styles.banner} style={{ borderColor: op.banner_color || undefined }}>
            <span style={{ color: op.banner_color || 'inherit' }}>{op.banner_text}</span>
          </div>
        )}

        {canEdit && (
          <div className={styles.dangerRow}>
            <button
              className={`btn ${op.deleted ? styles.restoreBtn : styles.deleteBtn}`}
              onClick={toggleDeleted}
            >
              {op.deleted ? '↩ Restore' : '✕ Delete operation'}
            </button>
          </div>
        )}
      </div>

      {/* Members */}
      <div className={styles.detailSection}>
        <div className="sec-label">Members</div>

        <div className={styles.memberList}>
          {sortedMembers.map((m) => {
            const isThisLead = m.operator.id === op.admin.id
            const isMe = m.operator.id === currentUserId
            const effectiveMode: 'lead' | 'operator' | 'spectator' = isThisLead ? 'lead' : m.view_mode
            return (
              <div key={m.operator.id} className={styles.memberRow}>
                <span className={`${styles.roleTag} ${styles[`role_${effectiveMode}`]}`}>
                  {VIEW_MODE_LABELS[effectiveMode]}
                </span>
                <span className={`${styles.memberName} ${isMe ? styles.memberNameMe : ''}`}>
                  {m.operator.username}
                  {m.operator.account_type === 'bot' && <span className={styles.botTag}>BOT</span>}
                </span>
                {canEdit && !isMe && (
                  <div className={styles.memberControls}>
                    <select
                      className={styles.roleSelect}
                      value={effectiveMode}
                      onChange={(e) => changeRole(m.operator.id, e.target.value as 'lead' | 'operator' | 'spectator')}
                    >
                      <option value="lead">Lead</option>
                      <option value="operator">Operator</option>
                      <option value="spectator">Spectator</option>
                    </select>
                    <button
                      className={styles.removeMember}
                      onClick={() => removeMember(m.operator.id)}
                      title="Remove from operation"
                    >✕</button>
                  </div>
                )}
              </div>
            )
          })}

          {sortedMembers.length === 0 && (
            <div className={styles.emptyMembers}>No members assigned</div>
          )}
        </div>

        {canEdit && unassigned.length > 0 && (
          <div className={styles.addMember}>
            <span className={styles.settingLabel}>Add member</span>
            <select
              className={styles.addSelect}
              value=""
              onChange={(e) => {
                const id = Number(e.target.value)
                if (id) addMember(id)
              }}
            >
              <option value="">Select operator…</option>
              {unassigned.map((o) => (
                <option key={o.id} value={o.id}>{o.username}{o.account_type === 'bot' ? ' (bot)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

// ── OperationsPanel ────────────────────────────────────────

export function OperationsPanel() {
  const userId         = useStore((s) => s.userId)
  const activeOp       = useStore((s) => s.activeOperation)
  const setActiveOp    = useStore((s) => s.setActiveOperation)

  const [operations,   setOperations]   = useState<Operation[]>([])
  const [allOperators, setAllOperators] = useState<OpOperator[]>([])
  const [selectedId,   setSelectedId]   = useState<number | null>(null)
  const [showDeleted,  setShowDeleted]  = useState(false)
  const [creating,     setCreating]     = useState(false)
  const [newOpName,    setNewOpName]    = useState('')
  const [createErr,    setCreateErr]    = useState('')

  useQuery(GET_OPERATIONS_WITH_MEMBERS, {
    fetchPolicy: 'network-only',
    onCompleted: (d) => {
      setOperations(d.operation ?? [])
      setAllOperators(d.operator ?? [])
      // Auto-select current active op
      if (!selectedId && d.operation?.length > 0) {
        const cur = d.operation.find((o: Operation) => o.id === activeOp?.id)
        setSelectedId(cur?.id ?? d.operation[0].id)
      }
    },
  })

  const currentUserIsAdmin = operations.some(
    (o) => o.operatoroperations.some(
      (m) => m.operator.id === userId && m.operator.id === o.admin.id
    )
  ) || allOperators.length > 0 // will check via operator admin flag below

  // Check admin via operator table (GET_OPERATORS not loaded here; derive from operations)
  // Admin = user is lead of any operation (or global admin — detect via GET_OPERATORS result)
  // Simple heuristic: check if any op has current user as admin → they're at least op lead
  const userIsGlobalAdmin = false // not available here without GET_OPERATORS; use SettingsPanel for that

  const [createOp, { loading: creatingOp }] = useMutation(CREATE_OPERATION, {
    onCompleted: (d) => {
      if (d.createOperation.status === 'success') {
        const newOp: Operation = {
          id: d.createOperation.operation_id,
          name: d.createOperation.operation_name,
          complete: false,
          deleted: false,
          banner_text: '',
          banner_color: '',
          admin: allOperators.find((o) => o.id === userId) ?? { id: userId ?? 0, username: '?', account_type: 'user' },
          operatoroperations: [],
        }
        setOperations((prev) => [...prev, newOp])
        setSelectedId(newOp.id)
        setCreating(false); setNewOpName(''); setCreateErr('')
      } else {
        setCreateErr(d.createOperation.error || 'Failed')
      }
    },
    onError: (e) => setCreateErr(e.message),
  })

  function handleOpUpdated(patch: Partial<Operation> & { id: number }) {
    setOperations((prev) => prev.map((o) =>
      o.id === patch.id ? { ...o, ...patch } : o,
    ))
  }

  function handleSwitched(newOp: Operation) {
    setActiveOp({ id: newOp.id, name: newOp.name })
  }

  const visible = operations.filter((o) => showDeleted || !o.deleted)
  const selected = operations.find((o) => o.id === selectedId) ?? null

  // Determine if current user can create operations (admin or Mythic default allows it)
  const canCreate = true // Mythic createOperation is available to all authenticated users

  return (
    <div className={styles.root}>
      {/* Left list */}
      <div className={styles.list}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>Operations</span>
          <div className={styles.listHeaderActions}>
            <button className={styles.showDeleted} onClick={() => setShowDeleted((v) => !v)}>
              {showDeleted ? 'Hide deleted' : 'Show deleted'}
            </button>
            {canCreate && (
              <button className="btn btn--primary" onClick={() => setCreating((v) => !v)}>
                {creating ? 'Cancel' : '+ New'}
              </button>
            )}
          </div>
        </div>

        {creating && (
          <div className={styles.createForm}>
            <input
              className={styles.createInput}
              placeholder="Operation name"
              value={newOpName}
              autoFocus
              onChange={(e) => setNewOpName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newOpName.trim()) {
                  createOp({ variables: { name: newOpName.trim() } })
                }
              }}
            />
            {createErr && <div className={styles.createErr}>{createErr}</div>}
            <button
              className="btn btn--primary"
              disabled={creatingOp || !newOpName.trim()}
              onClick={() => createOp({ variables: { name: newOpName.trim() } })}
            >
              {creatingOp ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}

        <div className={styles.opList}>
          {visible.map((o) => {
            const isCurrent = o.id === activeOp?.id
            const isSelected = o.id === selectedId
            return (
              <button
                key={o.id}
                className={`${styles.opItem} ${isSelected ? styles.opItemSelected : ''} ${o.deleted ? styles.opItemDeleted : ''}`}
                onClick={() => setSelectedId(o.id)}
              >
                <div className={styles.opItemTop}>
                  <span className={styles.opItemName}>{o.name}</span>
                  {isCurrent && <span className={styles.opCurrentDot} title="Active" />}
                </div>
                <div className={styles.opItemMeta}>
                  <span className={styles.opItemAdmin}>{o.admin.username}</span>
                  <span className={styles.opItemCount}>{o.operatoroperations.length} op{o.operatoroperations.length !== 1 ? 's' : ''}</span>
                  {o.complete && <span className={styles.opItemComplete}>done</span>}
                </div>
              </button>
            )
          })}
          {visible.length === 0 && (
            <div className={styles.emptyList}>No operations</div>
          )}
        </div>
      </div>

      {/* Right detail */}
      <div className={styles.detailWrap}>
        {selected ? (
          <OperationDetail
            key={selected.id}
            op={selected}
            allOperators={allOperators}
            currentUserId={userId}
            currentUserIsAdmin={userIsGlobalAdmin}
            activeOperationId={activeOp?.id ?? null}
            onOpUpdated={handleOpUpdated}
            onOpDeleted={(id, deleted) => handleOpUpdated({ id, deleted })}
            onSwitched={handleSwitched}
          />
        ) : (
          <div className={styles.emptyDetail}>Select an operation</div>
        )}
      </div>
    </div>
  )
}
