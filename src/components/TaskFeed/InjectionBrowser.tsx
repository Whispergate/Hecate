/* src/components/TaskFeed/InjectionBrowser.tsx
   Renders Apollo's `get_injection_techniques` JSON output as a table with a
   "set" button per technique that issues `set_injection_technique <name>`.
   Mirrors Apollo's get_injection_techniques.js browser script.
*/

import { useCallback } from 'react'
import { useMutation } from '@apollo/client'
import { CREATE_TASK } from '@/apollo/operations'
import styles from './InjectionBrowser.module.css'

// ── Types ─────────────────────────────────────────────

export interface InjectionTechnique {
  name:        string
  is_current?: boolean
}

// ── Parser ────────────────────────────────────────────
// Output is a JSON array of { name, is_current }. May arrive as multiple
// concatenated chunks (one array each) — concatenate their entries.

export function parseInjectionTechniques(raw: string): InjectionTechnique[] | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null

  // Split concatenated top-level JSON arrays/objects, parse each.
  const out: InjectionTechnique[] = []
  let depth = 0, start = -1, sawAny = false
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '[' || ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          const chunk = JSON.parse(trimmed.slice(start, i + 1))
          const arr = Array.isArray(chunk) ? chunk : [chunk]
          for (const e of arr) {
            if (e && typeof e.name === 'string' && typeof e.is_current === 'boolean') {
              out.push({ name: e.name, is_current: e.is_current })
              sawAny = true
            } else {
              return null // shape mismatch — not an injection-techniques payload
            }
          }
        } catch { return null }
        start = -1
      }
    }
  }
  return sawAny ? out : null
}

// ── Component ─────────────────────────────────────────

interface Props {
  techniques:        InjectionTechnique[]
  callbackDisplayId: number
}

export function InjectionBrowser({ techniques, callbackDisplayId }: Props) {
  const [createTask] = useMutation(CREATE_TASK)

  const setTechnique = useCallback((name: string) => {
    createTask({
      variables: {
        callback_id:      callbackDisplayId,
        command:          'set_injection_technique',
        params:           name,
        tasking_location: 'command_line',
        original_params:  name,
      },
    })
  }, [callbackDisplayId, createTask])

  const current = techniques.find(t => t.is_current)?.name

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <span className={styles.title}>injection techniques</span>
        <span className={styles.count}>{techniques.length}</span>
        {current && <span className={styles.currentLabel}>current: {current}</span>}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thAct} />
              <th className={styles.thName}>name</th>
            </tr>
          </thead>
          <tbody>
            {techniques.map(t => (
              <tr key={t.name} className={`${styles.row} ${t.is_current ? styles.rowCurrent : ''}`}>
                <td className={styles.tdAct}>
                  <button
                    className={styles.setBtn}
                    disabled={t.is_current}
                    title={t.is_current ? 'already active' : `set injection technique to ${t.name}`}
                    onClick={() => setTechnique(t.name)}
                  >{t.is_current ? 'active' : 'set'}</button>
                </td>
                <td className={styles.tdName}>
                  <span className={styles.techName}>{t.name}</span>
                  {t.is_current && <span className={styles.currentDot} title="current">●</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
