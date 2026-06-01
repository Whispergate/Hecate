/* ═══════════════════════════════════════════════════
   src/components/CommandBar/FileTaskModal.tsx
   Modal for commands with File-type parameters.
   Handles file upload → task creation flow.
   ═══════════════════════════════════════════════════ */

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_TASK, GET_CREDENTIALS, GET_DYNAMIC_QUERY_PARAMS } from '@/apollo/operations'
import { useStore }          from '@/store'
import { uploadTaskFile }    from '@/uploadTaskFile'
import styles                from './FileTaskModal.module.css'

interface CredentialOption {
  id:              number
  type:            string
  account:         string
  realm:           string
  credential_text: string | null
  comment:         string
  metadata:        string
}

export interface CommandParam {
  name:                    string
  display_name:            string
  type:                    string
  required:                boolean
  default_value:           string | null
  choices:                 string[] | null
  // Non-empty when the param's choices are computed server-side at task time
  // (e.g. assembly_inject's assembly_name). Resolved via GET_DYNAMIC_QUERY_PARAMS.
  dynamic_query_function:  string | null
  parameter_group_name:    string
  limit_credentials_by_type: string[] | null
}

interface Props {
  command:     string
  params:      CommandParam[]
  displayId:   number
  callbackId:  number   // internal callback id (NOT display_id) — required by the dynamic_query_function action
  payloadType: string
  defaultCwd:  string
  onClose:     () => void
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

// Unique sorted group names derived from params.
function getGroups(params: CommandParam[]): string[] {
  const seen = new Set<string>()
  const groups: string[] = []
  for (const p of params) {
    if (!seen.has(p.parameter_group_name)) {
      seen.add(p.parameter_group_name)
      groups.push(p.parameter_group_name)
    }
  }
  return groups.sort()
}

function defaultsForGroup(
  groupName: string,
  params: CommandParam[],
  defaultCwd: string,
): Record<string, string> {
  const groupParams = params.filter(p => p.parameter_group_name === groupName)
  const visible = groupParams
    .filter(p => p.type !== 'None')
    .filter(p => !isFilenameParam(p))
    .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i)
  const defaults: Record<string, string> = {}
  for (const p of visible) {
    if (p.type === 'File' || p.type === 'FileMultiple') continue
    if (p.type === 'Boolean') {
      defaults[p.name] = p.default_value ?? 'false'
    } else if (p.type === 'String' && isPathParam(p) && defaultCwd) {
      defaults[p.name] = defaultCwd
    } else {
      defaults[p.name] = p.default_value ?? ''
    }
  }
  return defaults
}

function labelGroup(name: string): string {
  if (name === 'Default') return 'Default'
  return name.replace(/_/g, ' ')
}

export function FileTaskModal({ command, params, displayId, callbackId, payloadType, defaultCwd, onClose }: Props) {
  const { token } = useStore()

  const allGroups = getGroups(params)
  // Prefer "Default" group; fall back to first group alphabetically.
  const initialGroup = allGroups.includes('Default') ? 'Default' : (allGroups[0] ?? 'Default')

  const [selectedGroup, setSelectedGroup] = useState(initialGroup)
  const [values,        setValues]        = useState<Record<string, string>>(
    () => defaultsForGroup(initialGroup, params, defaultCwd)
  )
  const [fileMap,  setFileMap]  = useState<Record<string, File | null>>({})
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  function handleGroupChange(newGroup: string) {
    setSelectedGroup(newGroup)
    setValues(defaultsForGroup(newGroup, params, defaultCwd))
    setFileMap({})
    setError(null)
  }

  const groupParams    = params.filter(p => p.parameter_group_name === selectedGroup)

  // Within that group: skip None (crypto), skip filename params (auto-populated from file.name), dedupe by name.
  const visibleParams = groupParams
    .filter(p => p.type !== 'None')
    .filter(p => !isFilenameParam(p))
    .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i)

  // Filename params in the same group — hidden from form, auto-populate in submit
  const hiddenFilenameParams = groupParams
    .filter(p => p.type !== 'None' && isFilenameParam(p))
    .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i)

  const [createTask] = useMutation(CREATE_TASK)

  const hasCredentialParam = visibleParams.some(p => p.type === 'CredentialJson')
  const { data: credData } = useQuery(GET_CREDENTIALS, { skip: !hasCredentialParam })
  const credentials: CredentialOption[] = credData?.credential ?? []

  // ── Dynamic-query choices ──
  // Some ChooseOne/ChooseMultiple params have no static `choices`; Mythic computes
  // them at task time (e.g. assembly_inject's assembly_name lists uploaded .exe
  // files). Resolve them via the dynamic_query_function action and merge in below.
  const [dynChoices, setDynChoices] = useState<Record<string, string[]>>({})
  const [dynLoading, setDynLoading] = useState<Record<string, boolean>>({})
  const [resolveDynamic] = useMutation(GET_DYNAMIC_QUERY_PARAMS)

  useEffect(() => {
    let cancelled = false
    const dynParams = visibleParams.filter(p => (p.dynamic_query_function ?? '') !== '')
    for (const p of dynParams) {
      setDynLoading(m => ({ ...m, [p.name]: true }))
      resolveDynamic({
        variables: {
          callback:       callbackId,
          command,
          payload_type:   payloadType,
          parameter_name: p.name,
        },
      })
        .then(res => {
          if (cancelled) return
          const fn = res.data?.dynamic_query_function
          if (fn?.status === 'success' && Array.isArray(fn.choices)) {
            setDynChoices(m => ({ ...m, [p.name]: fn.choices }))
          }
        })
        .catch(() => { /* leave choices empty on failure */ })
        .finally(() => { if (!cancelled) setDynLoading(m => ({ ...m, [p.name]: false })) })
    }
    return () => { cancelled = true }
    // Re-run when the active group changes (visibleParams shape depends on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, command, callbackId, payloadType])

  // Effective choices for a param: dynamic results take precedence, else static.
  function choicesFor(p: CommandParam): string[] {
    return dynChoices[p.name] ?? p.choices ?? []
  }

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
        } else if (p.type === 'CredentialJson') {
          try { paramsObj[p.name] = JSON.parse(values[p.name] ?? '{}') } catch { paramsObj[p.name] = {} }
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
          parameter_group_name:  selectedGroup,
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

        {/* ── Group switcher ── */}
        {allGroups.length > 1 && (
          <div className={styles.groupTabs}>
            {allGroups.map(g => (
              <button
                key={g}
                className={`${styles.groupTab} ${g === selectedGroup ? styles.groupTabActive : ''}`}
                onClick={() => handleGroupChange(g)}
                disabled={loading}
              >
                {labelGroup(g)}
              </button>
            ))}
          </div>
        )}

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
                  disabled={loading || dynLoading[p.name]}
                >
                  {!p.required && <option value="">— select —</option>}
                  {dynLoading[p.name] && choicesFor(p).length === 0 && (
                    <option value="">loading…</option>
                  )}
                  {choicesFor(p).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

              ) : p.type === 'CredentialJson' ? (
                <select
                  className={styles.select}
                  value={values[p.name] ?? ''}
                  onChange={e => setValue(p.name, e.target.value)}
                  disabled={loading}
                >
                  <option value="">— select credential —</option>
                  {credentials
                    .filter(c =>
                      !p.limit_credentials_by_type?.length ||
                      p.limit_credentials_by_type.includes(c.type)
                    )
                    .map(c => {
                      const preview = (c.credential_text ?? '').slice(0, 40)
                      const label   = `${c.account}${c.realm ? `@${c.realm}` : ''} — ${preview}${(c.credential_text?.length ?? 0) > 40 ? '…' : ''}${c.comment ? ` (${c.comment})` : ''}`
                      const val     = JSON.stringify({
                        type:       c.type,
                        account:    c.account,
                        realm:      c.realm,
                        credential: c.credential_text ?? '',
                        comment:    c.comment,
                      })
                      return <option key={c.id} value={val}>{label}</option>
                    })
                  }
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
