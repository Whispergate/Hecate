/* ═══════════════════════════════════════════════════
   src/components/CommandBar/SocksModal.tsx
   ═══════════════════════════════════════════════════ */

import { useState }    from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_TASK } from '@/apollo/operations'
import styles          from './SocksModal.module.css'

interface Props {
  displayId:   number
  activePorts: number[]   // active socks local_port values for this callback
  onClose:     () => void
}

export function SocksModal({ displayId, activePorts, onClose }: Props) {
  const [action,   setAction]   = useState<'start' | 'stop'>(
    activePorts.length ? 'stop' : 'start'
  )
  const [port,     setPort]     = useState(
    activePorts.length ? String(activePorts[0]) : '7000'
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)

  const [createTask, { loading }] = useMutation(CREATE_TASK, {
    onError: e => setError(e.message),
  })

  function handleActionChange(a: 'start' | 'stop') {
    setAction(a)
    if (a === 'stop' && activePorts.length) setPort(String(activePorts[0]))
    if (a === 'start') setPort('1080')
    setError(null)
  }

  async function handleSubmit() {
    const portNum = parseInt(port, 10)
    if (!portNum || portNum < 1 || portNum > 65535) {
      setError('Port must be 1–65535')
      return
    }
    const payload: Record<string, unknown> = { action, port: portNum }
    if (username.trim()) payload.username = username.trim()
    if (password.trim()) payload.password = password.trim()
    const params = JSON.stringify(payload)
    const res = await createTask({
      variables: {
        callback_id:      displayId,
        command:          'socks',
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
      <div className={styles.modal} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className={styles.header}>
          <span className={styles.title}>socks</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
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

          <div className={styles.field}>
            <label className={styles.label}>
              Port
              {action === 'stop' && activePorts.length > 0 && (
                <span className={styles.labelSub}> — active</span>
              )}
            </label>
            {action === 'stop' && activePorts.length > 0 ? (
              <div className={styles.chipRow}>
                {activePorts.map(p => (
                  <button
                    key={p}
                    className={`${styles.portChip} ${port === String(p) ? styles.portChipActive : ''}`}
                    onClick={() => setPort(String(p))}
                  >:{p}</button>
                ))}
              </div>
            ) : (
              <input
                className={styles.portInput}
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={e => { setPort(e.target.value); setError(null) }}
                autoFocus
                placeholder="7000"
              />
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Port Auth Username <span className={styles.labelSub}>— optional</span></label>
            <input
              className={styles.portInput}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="leave blank for no auth"
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Port Auth Password <span className={styles.labelSub}>— optional</span></label>
            <input
              className={styles.portInput}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="leave blank for no auth"
              autoComplete="off"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.submitBtn} ${action === 'stop' ? styles.submitStop : ''}`}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Sending…' : action === 'start' ? 'Start Proxy' : 'Stop Proxy'}
          </button>
        </div>
      </div>
    </div>
  )
}
