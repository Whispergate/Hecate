/* ═══════════════════════════════════════════════════
   src/components/CommandBar/RpfwdModal.tsx
   Dedicated modal for rpfwd (reverse port forward).
   ═══════════════════════════════════════════════════ */

import { useState }    from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_TASK } from '@/apollo/operations'
import styles          from './SocksModal.module.css'

interface ActiveRpfwd {
  local_port:  number
  remote_ip:   string
  remote_port: number
}

interface Props {
  displayId:    number
  activeRpfwds: ActiveRpfwd[]
  onClose:      () => void
}

export function RpfwdModal({ displayId, activeRpfwds, onClose }: Props) {
  const defaultAction = activeRpfwds.length ? 'stop' : 'start'

  const [action,     setAction]     = useState<'start' | 'stop'>(defaultAction)
  const [localPort,  setLocalPort]  = useState(
    activeRpfwds.length ? String(activeRpfwds[0].local_port) : '4444'
  )
  const [remoteIp,   setRemoteIp]   = useState(
    activeRpfwds.length ? activeRpfwds[0].remote_ip : ''
  )
  const [remotePort, setRemotePort] = useState(
    activeRpfwds.length ? String(activeRpfwds[0].remote_port) : '4444'
  )
  const [error,      setError]      = useState<string | null>(null)

  const [createTask, { loading }] = useMutation(CREATE_TASK, {
    onError: e => setError(e.message),
  })

  function selectRpfwd(r: ActiveRpfwd) {
    setLocalPort(String(r.local_port))
    setRemoteIp(r.remote_ip)
    setRemotePort(String(r.remote_port))
    setError(null)
  }

  function handleActionChange(a: 'start' | 'stop') {
    setAction(a)
    if (a === 'stop' && activeRpfwds.length) selectRpfwd(activeRpfwds[0])
    if (a === 'start') { setLocalPort('4444'); setRemoteIp(''); setRemotePort('4444') }
    setError(null)
  }

  async function handleSubmit() {
    const localPortNum = parseInt(localPort, 10)
    if (!localPortNum || localPortNum < 1 || localPortNum > 65535) {
      setError('Local port must be 1–65535')
      return
    }

    const payload: Record<string, unknown> = { action, local_port: localPortNum }

    if (action === 'start') {
      if (!remoteIp.trim()) { setError('Remote IP is required'); return }
      const remotePortNum = parseInt(remotePort, 10)
      if (!remotePortNum || remotePortNum < 1 || remotePortNum > 65535) {
        setError('Remote port must be 1–65535')
        return
      }
      payload.remote_ip   = remoteIp.trim()
      payload.remote_port = remotePortNum
    }

    const params = JSON.stringify(payload)
    const res = await createTask({
      variables: {
        callback_id:      displayId,
        command:          'rpfwd',
        params,
        tasking_location: 'modal',
        original_params:  params,
      },
    })
    if (res?.data?.createTask?.status === 'error') {
      setError(res.data.createTask.error ?? 'Task failed')
      return
    }
    onClose()
  }

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={styles.modal}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      >
        <div className={styles.header}>
          <span className={styles.title}>rpfwd</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* ── Action toggle ── */}
          <div className={styles.field}>
            <label className={styles.label}>Action</label>
            <div className={styles.actionRow}>
              <button
                className={`${styles.actionBtn} ${action === 'start' ? styles.actionStart : ''}`}
                onClick={() => handleActionChange('start')}
              >Start</button>
              <button
                className={`${styles.actionBtn} ${action === 'stop' ? styles.actionStop : ''}`}
                onClick={() => handleActionChange('stop')}
              >Stop</button>
            </div>
          </div>

          {/* ── Stop: show active rpfwds as chips ── */}
          {action === 'stop' && activeRpfwds.length > 0 ? (
            <div className={styles.field}>
              <label className={styles.label}>
                Active Forwards
                <span className={styles.labelSub}> — select to stop</span>
              </label>
              <div className={styles.chipRow}>
                {activeRpfwds.map(r => (
                  <button
                    key={r.local_port}
                    className={`${styles.portChip} ${localPort === String(r.local_port) ? styles.portChipActive : ''}`}
                    onClick={() => selectRpfwd(r)}
                  >
                    :{r.local_port} → {r.remote_ip}:{r.remote_port}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ── Local port (both start + stop-without-active) ── */}
              <div className={styles.field}>
                <label className={styles.label}>
                  Local Port
                  <span className={styles.labelSub}> — listening on Mythic server</span>
                </label>
                <input
                  className={styles.portInput}
                  type="number"
                  min={1}
                  max={65535}
                  value={localPort}
                  onChange={e => { setLocalPort(e.target.value); setError(null) }}
                  autoFocus
                  placeholder="4444"
                />
              </div>

              {/* ── Start-only: remote target ── */}
              {action === 'start' && (
                <>
                  <div className={styles.field}>
                    <label className={styles.label}>Remote IP</label>
                    <input
                      className={styles.portInput}
                      type="text"
                      value={remoteIp}
                      onChange={e => { setRemoteIp(e.target.value); setError(null) }}
                      placeholder="10.0.0.1"
                      autoComplete="off"
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Remote Port</label>
                    <input
                      className={styles.portInput}
                      type="number"
                      min={1}
                      max={65535}
                      value={remotePort}
                      onChange={e => { setRemotePort(e.target.value); setError(null) }}
                      placeholder="4444"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${action === 'stop' ? styles.submitStop : ''}`}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Sending…' : action === 'start' ? 'Start Forward' : 'Stop Forward'}
          </button>
        </div>
      </div>
    </div>
  )
}
