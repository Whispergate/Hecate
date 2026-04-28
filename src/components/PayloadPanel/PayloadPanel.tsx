/* ═══════════════════════════════════════════════════
   src/components/PayloadPanel/PayloadPanel.tsx
   Full-panel payload management view.
   Accessed via Rail → Payloads, replaces the main content area.
   ═══════════════════════════════════════════════════ */

import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { GET_PAYLOADS, DELETE_PAYLOAD } from '@/apollo/operations'
import { useStore }              from '@/store'
import { parseTs }               from '@/components/Sidebar/utils'
import { CreatePayloadModal }    from './CreatePayloadModal'
import { PayloadContextMenu }    from './PayloadContextMenu'
import styles                    from './PayloadPanel.module.css'

// ── Types ─────────────────────────────────────────────

interface PayloadBuildStep {
  id:               number
  step_number:      number
  step_name:        string
  step_description: string
  step_success:     boolean
  start_time:       string | null
  end_time:         string | null
  step_stdout:      string
  step_stderr:      string
}

export interface C2ParamInstance {
  value: string
  c2profileparameter: { name: string; c2profile: { name: string; is_p2p: boolean } }
}

export interface BuildParamInstance {
  value: string
  buildparameter: { name: string }
}

export interface Payload {
  id:             number
  uuid:           string
  description:    string
  os:             string
  build_phase:    string
  creation_time:  string
  auto_generated: boolean
  operator:       { username: string }
  payloadtype:    { name: string }
  filemetum:      { id: number; agent_file_id: string; filename_text: string; md5: string; sha1: string } | null
  callbacks_aggregate: { aggregate: { count: number } }
  c2profileparametersinstances: C2ParamInstance[]
  buildparameterinstances:      BuildParamInstance[]
  payloadcommands:              { command: { cmd: string } }[]
  payload_build_steps:          PayloadBuildStep[]
}

// ── Helpers ───────────────────────────────────────────

function decodeFilename(b64: string | undefined | null): string | null {
  if (!b64) return null
  try { return decodeURIComponent(escape(atob(b64))) } catch { return b64 }
}

function fmtDate(iso: string): string {
  return parseTs(iso).toLocaleString([], {
    month: 'short', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function buildPhaseStyle(phase: string): string {
  switch (phase) {
    case 'success':   return styles.phaseOk
    case 'building':  return styles.phaseBuilding
    case 'error':     return styles.phaseErr
    case 'cancelled': return styles.phaseWarn
    default:          return styles.phaseWarn
  }
}

function buildPhaseLabel(phase: string): string {
  switch (phase) {
    case 'success':   return 'ready'
    case 'building':  return 'building…'
    case 'error':     return 'build error'
    case 'cancelled': return 'cancelled'
    default:          return phase
  }
}

function agentStyle(name: string): { color: string } {
  const n = name.toLowerCase()
  if (n.includes('apollo'))   return { color: '#90d880' }
  if (n.includes('poseidon')) return { color: '#80c8d0' }
  if (n.includes('medusa'))   return { color: '#c090e0' }
  if (n.includes('hermes'))   return { color: '#d0a848' }
  if (n.includes('thanatos')) return { color: '#d08080' }
  if (n.includes('athena'))   return { color: '#80a8d0' }
  return { color: 'var(--bone-600)' }
}

function AgentIcon({ name, color }: { name: string; color: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = `/static/${name.toLowerCase()}_dark.svg`

  return (
    <span
      className={styles.agentIcon}
      style={{ '--agent-color': color } as React.CSSProperties}
      aria-hidden
    >
      {!imgFailed
        ? <img src={src} alt={name} className={styles.agentIconImg} onError={() => setImgFailed(true)} />
        : name.charAt(0).toUpperCase()
      }
    </span>
  )
}

// ── Payload list row ──────────────────────────────────

function PayloadRow({
  payload, selected, onClick, onContextMenu,
}: {
  payload: Payload; selected: boolean; onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const agent     = agentStyle(payload.payloadtype.name)
  const callCount = payload.callbacks_aggregate.aggregate.count

  return (
    <button
      className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <AgentIcon name={payload.payloadtype.name} color={agent.color} />

      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <span
            className={styles.agentBadge}
            style={{ '--agent-color': agent.color } as React.CSSProperties}
          >
            {payload.payloadtype.name}
          </span>
          <span className={styles.rowOs}>{payload.os || '—'}</span>
          <span className={`${styles.phaseDot} ${buildPhaseStyle(payload.build_phase)}`} />
        </div>

        <div className={styles.rowDesc}>
          {payload.description || decodeFilename(payload.filemetum?.filename_text) || payload.uuid.slice(0, 16) + '…'}
        </div>

        <div className={styles.rowMeta}>
          <span>{fmtDate(payload.creation_time)}</span>
          {callCount > 0 && (
            <span className={styles.callCount}>{callCount} cb</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Horizontal build step chain ───────────────────────

function HorizStepChain({ steps }: { steps: PayloadBuildStep[] }) {
  const [openId, setOpenId] = useState<number | null>(null)

  if (!steps.length) return null

  return (
    <div className={styles.horizChain}>
      {steps.map((s, i) => {
        const done    = !!s.end_time
        const running = !!s.start_time && !done
        const dotCls  = running       ? styles.hDotRunning
                      : done && s.step_success  ? styles.hDotOk
                      : done && !s.step_success ? styles.hDotErr
                      : styles.hDotPending
        const isOpen  = openId === s.id

        return (
          <div key={s.id} className={styles.horizStep}>
            {/* connector before dot (not on first) */}
            {i > 0 && <div className={styles.horizConnector} />}

            <div className={styles.horizNode}>
              <button
                className={`${styles.hBubble} ${dotCls}`}
                onClick={() => setOpenId(isOpen ? null : s.id)}
                title={s.step_name}
              />
              <span className={styles.hLabel}>{s.step_name}</span>
            </div>

            {/* expanded detail — rendered below the full chain via absolute/portal-free approach */}
            {isOpen && (
              <div className={styles.hPopover}>
                <div className={styles.hPopoverName}>{s.step_name}</div>
                {s.step_description && (
                  <div className={styles.hPopoverDesc}>{s.step_description}</div>
                )}
                {s.step_stdout && (
                  <>
                    <span className={styles.hOutputLabel}>stdout</span>
                    <pre className={styles.hOutputPre}>{s.step_stdout}</pre>
                  </>
                )}
                {s.step_stderr && (
                  <>
                    <span className={styles.hOutputLabel}>stderr</span>
                    <pre className={`${styles.hOutputPre} ${styles.hOutputErr}`}>{s.step_stderr}</pre>
                  </>
                )}
                {!s.step_stdout && !s.step_stderr && (
                  <span className={styles.hNoOutput}>no output</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────

function PayloadDetail({ payload, onDelete }: { payload: Payload; onDelete: () => void }) {
  const [copied,      setCopied]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const agent     = agentStyle(payload.payloadtype.name)
  const callCount = payload.callbacks_aggregate.aggregate.count

  const [deletePayload] = useMutation(DELETE_PAYLOAD)

  const copyUuid = useCallback(() => {
    navigator.clipboard.writeText(payload.uuid).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [payload.uuid])

  const handleDelete = useCallback(async () => {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await deletePayload({ variables: { payload_uuid: payload.uuid } })
    onDelete()
  }, [confirmDel, deletePayload, payload.id, onDelete])

  // Handler accepts both filemeta agent_file_id and payload UUID
  const downloadUrl = payload.build_phase === 'success'
    ? `/direct/download/${payload.filemetum?.agent_file_id ?? payload.uuid}`
    : null

  const filename = decodeFilename(payload.filemetum?.filename_text)
    || `${payload.payloadtype.name}_${payload.uuid.slice(0, 8)}`

  return (
    <div className={styles.detail}>

      {/* ── Header ── */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          <AgentIcon name={payload.payloadtype.name} color={agent.color} />
          <span
            className={styles.agentBadgeLg}
            style={{ '--agent-color': agent.color } as React.CSSProperties}
          >
            {payload.payloadtype.name}
          </span>
          <span className={`${styles.phasePill} ${buildPhaseStyle(payload.build_phase)}`}>
            {buildPhaseLabel(payload.build_phase)}
          </span>
          <div className={styles.headerActions}>
            {downloadUrl ? (
              <a className={styles.dlBtn} href={downloadUrl} download={filename}>↓ download</a>
            ) : (
              <span className={styles.dlBtnDisabled}>↓ download</span>
            )}
            <button
              className={`${styles.delBtn} ${confirmDel ? styles.delBtnConfirm : ''}`}
              onClick={handleDelete}
              disabled={deleting}
              onBlur={() => setConfirmDel(false)}
            >
              {deleting ? '…' : confirmDel ? 'confirm' : '✕'}
            </button>
          </div>
        </div>
        <div className={styles.detailDesc}>
          {payload.description || <em>(no description)</em>}
        </div>
      </div>

      {/* ── Info table ── */}
      <div className={styles.detailSection}>
        <div className="sec-label">Details</div>
        <table className={styles.infoTable}>
          <tbody>
            {[
              ['OS',        payload.os || '—'],
              ['Operator',  payload.operator?.username || '—'],
              ['Created',   fmtDate(payload.creation_time)],
              ['Callbacks', String(callCount)],
              ['Source',    payload.auto_generated ? 'auto-generated' : 'manual'],
              ['Filename',  decodeFilename(payload.filemetum?.filename_text) || '—'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className={styles.tdKey}>{k}</td>
                <td className={styles.tdVal}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── UUID ── */}
      <div className={styles.detailSection}>
        <div className="sec-label">UUID</div>
        <div className={styles.uuidRow}>
          <code className={styles.uuid}>{payload.uuid}</code>
          <button className={styles.copyBtn} onClick={copyUuid}>
            {copied ? 'copied ✓' : 'copy'}
          </button>
        </div>
      </div>

      {/* ── Build steps ── */}
      {payload.payload_build_steps?.length > 0 && (
        <div className={styles.detailSection}>
          <div className="sec-label">Build Steps</div>
          <HorizStepChain steps={payload.payload_build_steps} />
        </div>
      )}

      {/* ── Configuration ── */}
      {(payload.c2profileparametersinstances.length > 0
        || payload.buildparameterinstances.length > 0
        || payload.payloadcommands.length > 0) && (
        <div className={styles.detailSection}>
          <div className="sec-label">Configuration</div>

          {/* C2 profiles — group by profile name */}
          {(() => {
            const byProfile = new Map<string, C2ParamInstance[]>()
            for (const inst of payload.c2profileparametersinstances) {
              const prof = inst.c2profileparameter.c2profile.name
              if (!byProfile.has(prof)) byProfile.set(prof, [])
              byProfile.get(prof)!.push(inst)
            }
            return [...byProfile.entries()].map(([profName, params]) => (
              <div key={profName} className={styles.configGroup}>
                <div className={styles.configGroupLabel}>{profName}</div>
                <table className={styles.infoTable}>
                  <tbody>
                    {params.map(p => (
                      <tr key={p.c2profileparameter.name}>
                        <td className={styles.tdKey}>{p.c2profileparameter.name}</td>
                        <td className={`${styles.tdVal} ${styles.tdValMono}`}>
                          {p.value || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          })()}

          {/* Build parameters */}
          {payload.buildparameterinstances.length > 0 && (
            <div className={styles.configGroup}>
              <div className={styles.configGroupLabel}>Build Parameters</div>
              <table className={styles.infoTable}>
                <tbody>
                  {payload.buildparameterinstances.map(p => (
                    <tr key={p.buildparameter.name}>
                      <td className={styles.tdKey}>{p.buildparameter.name}</td>
                      <td className={`${styles.tdVal} ${styles.tdValMono}`}>
                        {p.value || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Commands */}
          {payload.payloadcommands.length > 0 && (
            <div className={styles.configGroup}>
              <div className={styles.configGroupLabel}>
                Commands
                <span className={styles.configGroupCount}>{payload.payloadcommands.length}</span>
              </div>
              <div className={styles.cmdChips}>
                {[...payload.payloadcommands]
                  .sort((a, b) => a.command.cmd.localeCompare(b.command.cmd))
                  .map(pc => (
                    <span key={pc.command.cmd} className={styles.cmdChip}>
                      {pc.command.cmd}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  )
}

// ── Empty detail placeholder ──────────────────────────

function EmptyDetail() {
  return (
    <div className={styles.emptyDetail}>
      <span className={styles.emptyIcon}>⬡</span>
      <span className={styles.emptyText}>select a payload</span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────

interface CtxMenu { payload: Payload; x: number; y: number }

export function PayloadPanel() {
  const activeOp = useStore((s) => s.activeOperation)
  const [selectedId,    setSelectedId]    = useState<number | null>(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [rebuildPayload, setRebuildPayload] = useState<Payload | null>(null)
  const [ctxMenu,       setCtxMenu]       = useState<CtxMenu | null>(null)

  const openCtx = useCallback((e: React.MouseEvent, payload: Payload) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ payload, x: e.clientX, y: e.clientY })
  }, [])

  const { data, loading, refetch } = useQuery(GET_PAYLOADS, {
    variables: { operation_id: activeOp?.id ?? 0 },
    skip: !activeOp,
    fetchPolicy: 'cache-and-network',
  })

  const payloads: Payload[] = data?.payload ?? []
  const selected = payloads.find(p => p.id === selectedId) ?? null

  const handleModalClose = useCallback(() => {
    setShowCreate(false)
    setRebuildPayload(null)
    refetch()
  }, [refetch])

  return (
    <div className={styles.panel}>
      {showCreate && (
        <CreatePayloadModal
          onClose={handleModalClose}
          initialPayload={rebuildPayload ?? undefined}
        />
      )}

      {/* ── Left: list ── */}
      <div className={styles.listPane}>
        <div className={styles.listHeader}>
          <span className={styles.listTitle}>Payloads</span>
          {payloads.length > 0 && (
            <span className={styles.listCount}>{payloads.length}</span>
          )}
          <button className={styles.newBtn} onClick={() => setShowCreate(true)} title="New payload">+</button>
          <button className={styles.refreshBtn} onClick={() => refetch()} title="Refresh">↺</button>
        </div>

        <div className={styles.list}>
          {loading && payloads.length === 0 && (
            <div className={styles.listEmpty}>Loading…</div>
          )}
          {!loading && payloads.length === 0 && (
            <div className={styles.listEmpty}>No payloads in this operation</div>
          )}
          {payloads.map(p => (
            <PayloadRow
              key={p.id}
              payload={p}
              selected={p.id === selectedId}
              onClick={() => setSelectedId(p.id)}
              onContextMenu={(e) => openCtx(e, p)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div className={styles.detailPane}>
        {selected
          ? <PayloadDetail payload={selected} onDelete={() => { setSelectedId(null); refetch() }} />
          : <EmptyDetail />
        }
      </div>

      {ctxMenu && (
        <PayloadContextMenu
          payload={ctxMenu.payload}
          payloads={payloads}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onRebuilt={() => { setCtxMenu(null); refetch() }}
          onRebuildWithEdits={() => { setCtxMenu(null); setRebuildPayload(ctxMenu.payload); setShowCreate(true) }}
        />
      )}
    </div>
  )
}
