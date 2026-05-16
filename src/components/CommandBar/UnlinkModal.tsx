/* ═══════════════════════════════════════════════════
   src/components/CommandBar/UnlinkModal.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useEffect } from 'react'
import { useLazyQuery, useMutation } from '@apollo/client'
import { CREATE_TASK, GET_CALLBACK_GRAPH_EDGES } from '@/apollo/operations'
import styles from './SocksModal.module.css'

// ── GQL types ────────────────────────────────────────

interface GQLParamInst {
  c2_profile_id:      number
  value:              string
  enc_key_base64:     string | null
  dec_key_base64:     string | null
  c2profileparameter: { crypto_type: boolean; name: string }
}

interface GQLEdgeCb {
  id:                number
  display_id:        number
  host:              string
  agent_callback_id: string
  payload:           { uuid: string }
  c2profileparametersinstances: GQLParamInst[]
}

interface GQLEdge {
  id:            number
  end_timestamp: string | null
  c2profile:     { id: number; name: string }
  source:        GQLEdgeCb
  destination:   GQLEdgeCb
}

interface Props {
  callbackId: number   // internal callback.id — for edge query WHERE clause
  displayId:  number   // display_id — for task creation
  onClose:    () => void
}

// ── Helpers ──────────────────────────────────────────

function buildC2Params(
  instances: GQLParamInst[],
  c2ProfileId: number,
): Record<string, unknown> {
  return instances
    .filter(i => i.c2_profile_id === c2ProfileId)
    .reduce<Record<string, unknown>>((acc, i) => {
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

// ── Component ─────────────────────────────────────────

export function UnlinkModal({ callbackId, displayId, onClose }: Props) {
  const [edges,       setEdges]       = useState<GQLEdge[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error,       setError]       = useState<string | null>(null)

  const [fetchEdges, { loading: fetching }] = useLazyQuery(GET_CALLBACK_GRAPH_EDGES, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const all: GQLEdge[] = (data?.callbackgraphedge ?? [])
        .filter((e: GQLEdge) => e.source.id !== e.destination.id)
      const active = all.filter(e => e.end_timestamp === null)
      const dead   = all.filter(e => e.end_timestamp !== null)
      setEdges([...active, ...dead])
      setSelectedIdx(0)
    },
  })

  useEffect(() => {
    fetchEdges({ variables: { callback_id: callbackId } })
  }, [callbackId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [createTask, { loading: submitting }] = useMutation(CREATE_TASK, {
    onError: e => setError(e.message),
  })

  function edgeLabel(e: GQLEdge): string {
    const isSource = e.source.id === callbackId
    const other    = isSource ? e.destination : e.source
    const dir      = isSource ? '→' : '←'
    const state    = e.end_timestamp === null ? 'Active' : 'Dead'
    return `Callback #${other.display_id} (${other.host}) ${dir} ${e.c2profile.name} (${state})`
  }

  async function handleSubmit() {
    const edge = edges[selectedIdx]
    if (!edge) { setError('No connection selected'); return }

    const isSource = edge.source.id === callbackId
    const other    = isSource ? edge.destination : edge.source
    const params   = buildC2Params(other.c2profileparametersinstances, edge.c2profile.id)

    const linkInfo = {
      host:          other.host,
      agent_uuid:    other.payload.uuid,
      callback_uuid: other.agent_callback_id,
      c2_profile:    { name: edge.c2profile.name, parameters: params },
    }
    const paramsJson = JSON.stringify({ link_info: linkInfo })

    const res = await createTask({
      variables: {
        callback_id:      displayId,
        command:          'unlink',
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

  const loading = fetching || submitting

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.modal} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className={styles.header}>
          <span className={styles.title}>unlink</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {fetching && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--bone-600)' }}>
              Loading connections…
            </span>
          )}

          {!fetching && edges.length === 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--bone-600)' }}>
              No linked callbacks found for this agent.
            </span>
          )}

          {edges.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>
                Linked Callback
                <span className={styles.labelSub}> — select to unlink</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {edges.map((e, i) => (
                  <button
                    key={e.id}
                    className={`${styles.portChip} ${i === selectedIdx ? styles.portChipActive : ''}`}
                    style={{ textAlign: 'left', width: '100%', padding: '8px 12px', fontWeight: 400 }}
                    onClick={() => { setSelectedIdx(i); setError(null) }}
                  >
                    {edgeLabel(e)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${styles.submitStop}`}
            onClick={handleSubmit}
            disabled={loading || edges.length === 0}
          >
            {submitting ? 'Sending…' : 'Unlink'}
          </button>
        </div>
      </div>
    </div>
  )
}
