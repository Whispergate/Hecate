/* ═══════════════════════════════════════════════════
   src/components/CommandBar/LinkModal.tsx
   Cascading host → payload/callback → C2 profile
   selector for Apollo's "link" command.
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react'
import { useLazyQuery, useMutation } from '@apollo/client'
import { CREATE_TASK, GET_LINK_TARGETS, GET_P2P_PAYLOADS, ADD_PAYLOAD_ON_HOST } from '@/apollo/operations'
import { useStore } from '@/store'
import styles from './LinkModal.module.css'

// ── GQL types ────────────────────────────────────────

interface GQLParamInst {
  c2_profile_id:      number
  value:              string
  enc_key_base64:     string | null
  dec_key_base64:     string | null
  c2profile:          { id: number; name: string }
  c2profileparameter: { crypto_type: boolean; name: string }
}

interface GQLPayloadOnHost {
  host: string
  payload: {
    uuid:        string
    description: string
    filemetum:   { filename_text: string } | null
    c2profileparametersinstances: GQLParamInst[]
  }
}

interface GQLCallbackP2P {
  agent_callback_id: string
  host:              string
  display_id:        number
  payload:           { uuid: string }
  c2profileparametersinstances: GQLParamInst[]
}

interface GQLPayload {
  id:          number
  description: string
  payloadtype: { name: string }
  filemetum:   { filename_text: string } | null
}

interface Props {
  displayId: number
  onClose:   () => void
}

// ── Internal data model ───────────────────────────────

interface C2Info {
  profileId:   number
  profileName: string
  parameters:  Record<string, unknown>
}

interface LinkTarget {
  label:        string   // filename or "Callback #3"
  host:         string
  uuid:         string   // payload.uuid (for key material lookup)
  callbackUuid: string   // agent_callback_id or '' for staged payloads
  c2infos:      C2Info[]
}

// ── Helpers ──────────────────────────────────────────

function buildC2ParamsFromInstances(instances: GQLParamInst[]): Record<string, unknown> {
  return instances.reduce<Record<string, unknown>>((acc, i) => {
    if (i.c2profileparameter.crypto_type) {
      acc[i.c2profileparameter.name] = {
        crypto_type: 'aes256_hmac',
        enc_key:     i.enc_key_base64 ?? '',
        dec_key:     i.dec_key_base64 ?? '',
      }
    } else {
      acc[i.c2profileparameter.name] = i.value
    }
    return acc
  }, {})
}

function groupByProfile(instances: GQLParamInst[]): C2Info[] {
  const map = new Map<number, { name: string; insts: GQLParamInst[] }>()
  for (const i of instances) {
    if (!map.has(i.c2_profile_id)) {
      map.set(i.c2_profile_id, { name: i.c2profile.name, insts: [] })
    }
    map.get(i.c2_profile_id)!.insts.push(i)
  }
  return [...map.entries()].map(([id, { name, insts }]) => ({
    profileId:   id,
    profileName: name,
    parameters:  buildC2ParamsFromInstances(insts),
  }))
}

function decodeName(filename_text: string | undefined): string {
  if (!filename_text) return 'payload'
  try { return atob(filename_text) } catch { return 'payload' }
}

function buildTargets(data: {
  payloadonhost: GQLPayloadOnHost[]
  callback:      GQLCallbackP2P[]
}): LinkTarget[] {
  const targets: LinkTarget[] = []

  for (const poh of data.payloadonhost ?? []) {
    const c2infos = groupByProfile(poh.payload.c2profileparametersinstances)
    if (c2infos.length === 0) continue
    targets.push({
      label:        decodeName(poh.payload.filemetum?.filename_text),
      host:         poh.host,
      uuid:         poh.payload.uuid,
      callbackUuid: '',
      c2infos,
    })
  }

  for (const cb of data.callback ?? []) {
    const c2infos = groupByProfile(cb.c2profileparametersinstances)
    if (c2infos.length === 0) continue
    targets.push({
      label:        `Callback #${cb.display_id}`,
      host:         cb.host,
      uuid:         cb.payload.uuid,
      callbackUuid: cb.agent_callback_id,
      c2infos,
    })
  }

  return targets
}

// ── Component ─────────────────────────────────────────

export function LinkModal({ displayId, onClose }: Props) {
  const activeOperation = useStore(s => s.activeOperation)

  const [targets,      setTargets]      = useState<LinkTarget[]>([])
  const [selectedHost, setSelectedHost] = useState('')
  const [targetIdx,    setTargetIdx]    = useState(0)
  const [c2Idx,        setC2Idx]        = useState(0)
  const [error,        setError]        = useState<string | null>(null)

  // Register-host sub-form state
  const [showRegister, setShowRegister] = useState(false)
  const [regHost,      setRegHost]      = useState('')
  const [regPayloadId, setRegPayloadId] = useState<number | ''>('')
  const [regError,     setRegError]     = useState<string | null>(null)
  const [p2pPayloads,  setP2pPayloads]  = useState<GQLPayload[]>([])

  // After registration, select the newly added host on next refresh
  const selectOnRefreshRef = useRef<string>('')

  const [fetchTargets, { loading: fetching }] = useLazyQuery(GET_LINK_TARGETS, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const built = buildTargets(data)
      setTargets(built)
      const hosts = [...new Set(built.map(t => t.host))].sort()
      if (hosts.length > 0) {
        const preferred = selectOnRefreshRef.current
        selectOnRefreshRef.current = ''
        const pick = (preferred && hosts.includes(preferred)) ? preferred : hosts[0]
        setSelectedHost(pick)
        setTargetIdx(0)
        setC2Idx(0)
      }
    },
    onError(e) { setError(e.message) },
  })

  const [fetchP2PPayloads, { loading: fetchingPayloads }] = useLazyQuery(GET_P2P_PAYLOADS, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      setP2pPayloads(data?.payload ?? [])
    },
  })

  useEffect(() => {
    if (activeOperation?.id) fetchTargets({ variables: { operation_id: activeOperation.id } })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [createTask,       { loading: submitting }] = useMutation(CREATE_TASK, {
    onError: e => setError(e.message),
  })
  const [addPayloadOnHost, { loading: adding }]     = useMutation(ADD_PAYLOAD_ON_HOST)

  const hostList    = [...new Set(targets.map(t => t.host))].sort()
  const hostTargets = targets.filter(t => t.host === selectedHost)
  const selTarget   = hostTargets[targetIdx]
  const c2infos     = selTarget?.c2infos ?? []

  function handleHostSelect(host: string) {
    setSelectedHost(host)
    setTargetIdx(0)
    setC2Idx(0)
    setError(null)
  }

  function openRegister() {
    setShowRegister(true)
    setRegHost('')
    setRegPayloadId('')
    setRegError(null)
    fetchP2PPayloads()
  }

  async function handleRegister() {
    if (!regHost.trim())  { setRegError('Hostname is required'); return }
    if (regPayloadId === '') { setRegError('Select a payload'); return }
    try {
      const res = await addPayloadOnHost({
        variables: { host: regHost.trim(), payload_id: regPayloadId },
      })
      if (!res?.data) { setRegError('Insert failed'); return }
      selectOnRefreshRef.current = regHost.trim()
      setShowRegister(false)
      if (activeOperation?.id) fetchTargets({ variables: { operation_id: activeOperation.id } })
    } catch (e) {
      setRegError(e instanceof Error ? e.message : 'Failed to register host')
    }
  }

  async function handleSubmit() {
    if (!selTarget) { setError('No target selected'); return }
    const c2info = c2infos[c2Idx]
    if (!c2info) { setError('No C2 profile available'); return }

    const connectionInfo = {
      host:          selTarget.host,
      agent_uuid:    selTarget.uuid,
      callback_uuid: selTarget.callbackUuid,
      c2_profile:    { name: c2info.profileName, parameters: c2info.parameters },
    }
    const paramsJson = JSON.stringify({ connection_info: connectionInfo })

    const res = await createTask({
      variables: {
        callback_id:      displayId,
        command:          'link',
        params:           paramsJson,
        tasking_location: 'modal',
        original_params:  paramsJson,
      },
    })
    if (res?.data?.createTask?.status === 'error') {
      setError(res.data.createTask.error ?? 'Task failed')
      return
    }
    onClose()
  }

  const loading    = fetching || submitting || adding
  const hasTargets = hostList.length > 0

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.modal} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className={styles.header}>
          <span className={styles.title}>link</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {fetching && (
            <span className={styles.hint}>Loading P2P targets…</span>
          )}

          {!fetching && (
            <>
              {/* ── Host selection / registration (always shown) ── */}
              <div className={styles.field}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label className={styles.label} style={{ margin: 0 }}>Target Host</label>
                  <button
                    className={styles.registerBtn}
                    onClick={openRegister}
                    disabled={showRegister}
                  >
                    + register host
                  </button>
                </div>

                {!hasTargets && !showRegister && (
                  <span className={styles.hint}>
                    No P2P-capable payloads or callbacks found.{'\n'}
                    Deploy an SMB/P2P payload first, or click <em>+ register host</em> to
                    register a staged payload with a hostname.
                  </span>
                )}

                {hasTargets && (
                  hostList.length <= 6 ? (
                    <div className={styles.chipRow}>
                      {hostList.map(h => (
                        <button
                          key={h}
                          className={`${styles.chip} ${h === selectedHost ? styles.chipActive : ''}`}
                          onClick={() => handleHostSelect(h)}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <select
                      className={styles.select}
                      value={selectedHost}
                      onChange={e => handleHostSelect(e.target.value)}
                    >
                      {hostList.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  )
                )}

                {/* ── Register sub-form ── */}
                {showRegister && (
                  <div className={styles.registerForm}>
                    <input
                      className={styles.select}
                      type="text"
                      placeholder="hostname (e.g. WORKSTATION01)"
                      value={regHost}
                      onChange={e => { setRegHost(e.target.value); setRegError(null) }}
                      autoFocus
                      autoComplete="off"
                    />
                    <select
                      className={styles.select}
                      value={regPayloadId}
                      onChange={e => { setRegPayloadId(e.target.value === '' ? '' : Number(e.target.value)); setRegError(null) }}
                      disabled={fetchingPayloads}
                    >
                      <option value="">{fetchingPayloads ? 'Loading payloads…' : '— select payload —'}</option>
                      {p2pPayloads.map(p => (
                        <option key={p.id} value={p.id}>
                          {decodeName(p.filemetum?.filename_text)} ({p.payloadtype.name})
                        </option>
                      ))}
                    </select>
                    {p2pPayloads.length === 0 && !fetchingPayloads && (
                      <span className={styles.hint}>
                        No P2P payloads built yet. Build an SMB/P2P payload first
                        from the Payloads panel.
                      </span>
                    )}
                    {regError && <div className={styles.error}>{regError}</div>}
                    <div className={styles.registerRow}>
                      <button
                        className={styles.registerCancelBtn}
                        onClick={() => setShowRegister(false)}
                        disabled={adding}
                      >
                        cancel
                      </button>
                      <button
                        className={styles.registerConfirmBtn}
                        onClick={handleRegister}
                        disabled={adding || fetchingPayloads || p2pPayloads.length === 0}
                      >
                        {adding ? 'registering…' : 'confirm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Payload / callback selector ── */}
              {hostTargets.length > 0 && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    Payload / Callback
                    {selTarget?.callbackUuid
                      ? <span className={styles.labelSub}> — active callback</span>
                      : <span className={styles.labelSub}> — staged payload</span>
                    }
                  </label>
                  <select
                    className={styles.select}
                    value={targetIdx}
                    onChange={e => {
                      setTargetIdx(Number(e.target.value))
                      setC2Idx(0)
                      setError(null)
                    }}
                  >
                    {hostTargets.map((t, i) => (
                      <option key={i} value={i}>
                        {t.label}{t.callbackUuid ? ' (callback)' : ' (payload)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── C2 profile ── (only shown when > 1 option) */}
              {c2infos.length > 1 && (
                <div className={styles.field}>
                  <label className={styles.label}>C2 Profile</label>
                  <select
                    className={styles.select}
                    value={c2Idx}
                    onChange={e => { setC2Idx(Number(e.target.value)); setError(null) }}
                  >
                    {c2infos.map((c, i) => (
                      <option key={i} value={i}>{c.profileName}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── C2 profile name when only 1 ── */}
              {c2infos.length === 1 && (
                <div className={styles.field}>
                  <label className={styles.label}>
                    C2 Profile
                    <span className={styles.labelSub}> — {c2infos[0].profileName}</span>
                  </label>
                </div>
              )}
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading || !hasTargets}
          >
            {submitting ? 'Sending…' : 'Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
