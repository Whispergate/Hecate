/* ═══════════════════════════════════════════════════
   hecate/src/components/CommandBar/CommandBar.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useRef, useCallback } from 'react'
import { useMutation }  from '@apollo/client'
import { CREATE_TASK }  from '@/apollo/operations'
import { useStore }     from '@/store'
import styles           from './CommandBar.module.css'

export function CommandBar() {
  const [input, setInput]   = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const [history, setHistory] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const { selectedCallbackId } = useStore()

  const [createTask, { loading }] = useMutation(CREATE_TASK)

  const handleSubmit = useCallback(async () => {
    const raw = input.trim()
    if (!raw || !selectedCallbackId) return

    // Split "command [params]"
    const [command, ...rest] = raw.split(' ')
    const params = rest.join(' ')

    setHistory((h) => [raw, ...h.slice(0, 99)])
    setHistIdx(-1)
    setInput('')

    try {
      await createTask({
        variables: { callback_id: selectedCallbackId, command, params },
      })
    } catch (err) {
      console.error('Task creation failed:', err)
    }
  }, [input, selectedCallbackId, createTask])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
      return
    }
    // History navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setInput(history[next] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = histIdx - 1
      if (next < 0) { setHistIdx(-1); setInput(''); return }
      setHistIdx(next)
      setInput(history[next] ?? '')
    }
  }

  const { callbacks, selectedCallbackId: cbId } = useStore()
  const cb = callbacks.find((c) => c.id === cbId)
  const prompt = cb ? `hecate:${cb.host}` : 'hecate'

  return (
    <div className={styles.cmdBar}>
      <span className={styles.prefix}>{prompt} ›</span>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={selectedCallbackId ? 'issue task…' : 'select a callback first…'}
        disabled={!selectedCallbackId || loading}
        autoFocus
        autoComplete="off"
        spellCheck={false}
      />
      {!loading && <span className={styles.cursor} />}
      {loading  && <span className={styles.sending}>sending…</span>}
    </div>
  )
}
