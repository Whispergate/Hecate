/* ═══════════════════════════════════════════════════
   src/components/CommandBar/FileTaskModal.tsx
   Modal for commands with File-type parameters.
   Handles file upload → task creation flow.
   ═══════════════════════════════════════════════════ */

import { useState, useRef } from 'react'
import { useMutation }       from '@apollo/client'
import { CREATE_TASK }       from '@/apollo/operations'
import { useStore }          from '@/store'
import styles                from './FileTaskModal.module.css'

export interface CommandParam {
  name:                string
  display_name:        string
  type:                string
  required:            boolean
  default_value:       string | null
  choices:             string[] | null
  parameter_group_name:string
}

interface Props {
  command:    string
  params:     CommandParam[]
  displayId:  number
  defaultCwd: string
  onClose:    () => void
}

// Params whose value should be taken from the selected file's name — hide from form
function isFilenameParam(p: CommandParam): boolean {
  const n = p.name.toLowerCase()
  const d = (p.display_name || '').toLowerCase()
  return n === 'filename' || n.endsWith('_filename') || n.endsWith('filename') ||
         d === 'filename' || d.includes('file name') || d.includes('remote name')
}

// Heuristic: is this a destination path param (pre-fill with cwd)?
function isPathParam(p: CommandParam): boolean {
  const n = p.name.toLowerCase()
  const d = (p.display_name || '').toLowerCase()
  return n.includes('path') || n.includes('destination') ||
         d.includes('path') || d.includes('destination')
}

async function uploadTaskFile(file: File, token: string): Promise<string | null> {
  const form = new FormData()
  form.append('file', file)
  form.append('comment', 'Uploaded as part of tasking')

  try {
    const res = await fetch('/api/v1.4/task_upload_file_webhook', {
      method: 'POST',
      body:   form,
      headers: {
        Authorization: `Bearer ${token}`,
        MythicSource:  'web',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.agent_file_id as string | undefined) ?? null
  } catch {
    return null
  }
}

export function FileTaskModal({ command, params, displayId, defaultCwd, onClose }: Props) {
  const { token } = useStore()

  // Pick the parameter group that contains the File-type param.
  // Sending params from multiple groups causes Mythic to reject with "don't match any parameter group".
  const fileParam      = params.find(p => p.type === 'File' || p.type === 'FileMultiple')
  const activeGroup    = fileParam?.parameter_group_name ?? 'Default Parameter Group'
  const groupParams    = params.filter(p => p.parameter_group_name === activeGroup)

  // Within that group: skip None (crypto), skip filename params (auto-populated from file.name), dedupe by name.
  const visibleParams = groupParams
    .filter(p => p.type !== 'None')
    .filter(p => !isFilenameParam(p))
    .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i)

  // Filename params in the same group — hidden from form, auto-populate in submit
  const hiddenFilenameParams = groupParams
    .filter(p => p.type !== 'None' && isFilenameParam(p))
    .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i)

  const [values, setValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    for (const p of visibleParams) {
      if (p.type === 'File' || p.type === 'FileMultiple') continue
      if (p.type === 'Boolean') {
        defaults[p.name] = p.default_value ?? 'false'
      } else if (p.type === 'String' && isPathParam(p) && defaultCwd) {
        // Pre-fill path params with the callback's cwd
        defaults[p.name] = defaultCwd
      } else {
        defaults[p.name] = p.default_value ?? ''
      }
    }
    return defaults
  })

  const [fileMap,  setFileMap]  = useState<Record<string, File | null>>({})
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [createTask] = useMutation(CREATE_TASK)

  function setValue(name: string, val: string) {
    setValues(v => ({ ...v, [name]: val }))
  }

  // When a file is chosen, also auto-populate filename String params
  function handleFileChange(fileParamName: string, file: File | null) {
    setFileMap(m => ({ ...m, [fileParamName]: file }))
    if (file) {
      for (const p of visibleParams) {
        if (p.type === 'String' && isFilenameParam(p)) {
          setValue(p.name, file.name)
        }
      }
    }
  }

  async function handleSubmit() {
    setError(null)
    setLoading(true)

    try {
      // Validate required params
      for (const p of visibleParams) {
        if (!p.required) continue
        if (p.type === 'File' || p.type === 'FileMultiple') {
          if (!fileMap[p.name]) {
            setError(`"${p.display_name || p.name}" is required`)
            setLoading(false)
            return
          }
        } else if (p.type !== 'Boolean' && p.type !== 'None') {
          if (!(values[p.name] ?? '').trim()) {
            setError(`"${p.display_name || p.name}" is required`)
            setLoading(false)
            return
          }
        }
      }

      // Build params object, uploading files along the way
      const paramsObj: Record<string, unknown> = {}
      const fileUUIDs: string[] = []

      // Find the first selected file (for auto-populating filename params)
      const firstFileEntry = Object.entries(fileMap).find(([, f]) => f != null)
      const firstFile = firstFileEntry?.[1] ?? null

      // Auto-populate hidden filename params from the selected file's name
      for (const p of hiddenFilenameParams) {
        paramsObj[p.name] = firstFile?.name ?? ''
      }

      for (const p of visibleParams) {
        if (p.type === 'File' || p.type === 'FileMultiple') {
          const f = fileMap[p.name]
          if (f) {
            const uuid = await uploadTaskFile(f, token ?? '')
            if (!uuid) {
              setError(`Failed to upload file for "${p.display_name || p.name}"`)
              setLoading(false)
              return
            }
            paramsObj[p.name] = uuid
            fileUUIDs.push(uuid)
          }
        } else if (p.type === 'Boolean') {
          paramsObj[p.name] = values[p.name] === 'true'
        } else if (p.type === 'Number') {
          const n = Number(values[p.name])
          paramsObj[p.name] = isNaN(n) ? 0 : n
        } else if (p.type === 'Array' || p.type === 'TypedArray' || p.type === 'ChooseMultiple') {
          paramsObj[p.name] = (values[p.name] ?? '')
            .split(',').map(s => s.trim()).filter(Boolean)
        } else if (p.type !== 'None') {
          paramsObj[p.name] = values[p.name] ?? ''
        }
      }

      const paramsJson = JSON.stringify(paramsObj)

      const result = await createTask({
        variables: {
          callback_id:           displayId,
          command,
          params:                paramsJson,
          tasking_location:      'modal',
          original_params:       paramsJson,
          files:                 fileUUIDs.length > 0 ? fileUUIDs : undefined,
          parameter_group_name:  activeGroup,
        },
      })

      if (result.data?.createTask?.status === 'error') {
        setError(result.data.createTask.error ?? 'Task creation failed')
        setLoading(false)
        return
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.modal}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <span className={styles.title}>{command}</span>
          <button className={styles.closeBtn} onClick={onClose} disabled={loading}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {visibleParams.length === 0 && (
            <div className={styles.emptyNote}>
              No parameter definitions found for <em>{command}</em>.
              The agent may not have synced its command schema yet.
            </div>
          )}

          {visibleParams.map(p => (
            <div key={p.name} className={styles.field}>
              <label className={styles.label}>
                {p.display_name || p.name}
                {p.required && <span className={styles.required}> *</span>}
              </label>

              {(p.type === 'File' || p.type === 'FileMultiple') ? (
                <div className={styles.filePicker}>
                  <input
                    type="file"
                    ref={el => { fileRefs.current[p.name] = el }}
                    style={{ display: 'none' }}
                    multiple={p.type === 'FileMultiple'}
                    onChange={e => handleFileChange(p.name, e.target.files?.[0] ?? null)}
                  />
                  <button
                    className={styles.fileBtn}
                    onClick={() => fileRefs.current[p.name]?.click()}
                    disabled={loading}
                  >
                    browse
                  </button>
                  <span className={styles.fileName}>
                    {fileMap[p.name]?.name ?? 'no file selected'}
                  </span>
                </div>

              ) : p.type === 'Boolean' ? (
                <div className={styles.checkRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={values[p.name] === 'true'}
                    onChange={e => setValue(p.name, e.target.checked ? 'true' : 'false')}
                    disabled={loading}
                  />
                </div>

              ) : (p.type === 'ChooseOne' || p.type === 'ChooseOneCustom') ? (
                <select
                  className={styles.select}
                  value={values[p.name] ?? ''}
                  onChange={e => setValue(p.name, e.target.value)}
                  disabled={loading}
                >
                  {!p.required && <option value="">— select —</option>}
                  {(p.choices ?? []).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

              ) : (
                <input
                  type={p.type === 'Number' ? 'number' : 'text'}
                  className={styles.textInput}
                  value={values[p.name] ?? ''}
                  onChange={e => setValue(p.name, e.target.value)}
                  disabled={loading}
                  placeholder={p.default_value ?? ''}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            cancel
          </button>
          <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
            {loading ? 'uploading…' : 'execute'}
          </button>
        </div>

      </div>
    </div>
  )
}
