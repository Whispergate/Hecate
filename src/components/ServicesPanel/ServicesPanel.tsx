/* ═══════════════════════════════════════════════════
   src/components/ServicesPanel/ServicesPanel.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSubscription, useMutation, useLazyQuery, useQuery } from '@apollo/client'
import {
  SUB_PAYLOAD_TYPES,
  SUB_C2_PROFILES,
  SUB_TRANSLATION_CONTAINERS,
  SUB_CONSUMING_SERVICES,
  START_STOP_C2,
  CONTAINER_LIST_FILES,
  CONTAINER_DOWNLOAD_FILE,
  CONTAINER_WRITE_FILE,
  CONTAINER_REMOVE_FILE,
  GET_AGENT_COMMANDS,
  GET_C2_PROFILE_PARAMS,
  GET_C2_INSTANCE_VALUES_BY_NAME,
  CREATE_C2_INSTANCE,
  DELETE_C2_INSTANCE,
  IMPORT_C2_INSTANCE,
  TOGGLE_CONSUMING_DELETE,
  TEST_WEBHOOK,
  TEST_LOG,
  GET_IDP_METADATA,
} from '@/apollo/operations'
import styles from './ServicesPanel.module.css'
import { agentColor } from '@/agentColor'

// ── Types ──────────────────────────────────────────────

interface PayloadType {
  id: number; name: string; author: string; note: string
  container_running: boolean; wrapper: boolean
  agent_type: string; semver: string; supported_os: string[]
  translationcontainer: { id: number; name: string; container_running: boolean } | null
  wrap_these_payload_types: { wrapped: { name: string } }[]
}

interface C2Profile {
  id: number; name: string; author: string; description: string
  is_p2p: boolean; running: boolean; container_running: boolean; semver: string
  payloadtypec2profiles: { payloadtype: { id: number; name: string; deleted: boolean } }[]
}

interface TranslationContainer {
  id: number; name: string; author: string; description: string
  container_running: boolean; semver: string
  payloadtypes: { id: number; name: string; deleted: boolean }[]
}

interface ConsumingService {
  id: number; name: string; description: string
  type: string; container_running: boolean; semver: string
  subscriptions: string[] | null
}

// Event types Mythic can fire a test for (mirrors ConsumingServicesTable.js)
const WEBHOOK_EVENTS = ['new_alert', 'new_callback', 'new_custom', 'new_feedback', 'new_startup']
const LOGGING_EVENTS = ['new_artifact', 'new_callback', 'new_credential', 'new_file', 'new_keylog', 'new_payload', 'new_response', 'new_task']

interface AgentCommand {
  id: number; cmd: string; description: string; help_cmd: string; version: number
}

// ── Helpers ────────────────────────────────────────────

function AgentIcon({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  const color = agentColor(name)
  const cls = size === 'md' ? styles.iconMd : styles.iconSm
  const imgCls = size === 'md' ? styles.iconMdImg : styles.iconSmImg
  return (
    <span className={cls} style={{ '--agent-color': color } as React.CSSProperties}>
      {!failed
        ? <img src={`/static/${name.toLowerCase()}_dark.svg`} alt="" className={imgCls} onError={() => setFailed(true)} />
        : name.charAt(0).toUpperCase()}
    </span>
  )
}

function StatusDot({ running }: { running: boolean }) {
  return <span className={`${styles.dot} ${running ? styles.dotOn : styles.dotOff}`} />
}

function Chip({ label }: { label: string }) {
  return <span className={styles.chip}>{label}</span>
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaKey}>{label}</span>
      <span className={styles.metaVal}>{children}</span>
    </div>
  )
}

// ── Config editor modal ────────────────────────────────

function ConfigModal({ containerName, onClose }: { containerName: string; onClose: () => void }) {
  const filename = 'config.json'
  const [content, setContent] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fetchFile] = useLazyQuery(CONTAINER_DOWNLOAD_FILE, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerDownloadFile
      if (r?.status === 'success') {
        try { setContent(atob(r.data)) } catch { setContent(r.data) }
      } else setStatus(r?.error ?? 'fetch failed')
    },
    onError(e) { setStatus(e.message) },
  })

  const [writeFile] = useMutation(CONTAINER_WRITE_FILE, {
    onCompleted(data) {
      setSaving(false)
      const r = data?.containerWriteFile
      setStatus(r?.status === 'success' ? 'saved' : (r?.error ?? 'save failed'))
    },
    onError(e) { setSaving(false); setStatus(e.message) },
  })

  useEffect(() => { fetchFile({ variables: { container_name: containerName, filename } }) }, [])

  function save() {
    if (content == null) return
    setSaving(true); setStatus('')
    writeFile({ variables: { container_name: containerName, file_path: filename, data: btoa(content) } })
  }

  function exportConfig() {
    if (content == null) return
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${containerName}_config.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatus('exported')
  }

  function onImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setContent(text)
      setStatus('imported — review & save to apply')
    }
    reader.onerror = () => setStatus('import failed')
    reader.readAsText(f)
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{containerName} — config.json</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        {content == null && !status && <div className={styles.modalMsg}>loading…</div>}
        {content != null && (
          <textarea
            className={styles.configEditor}
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
          />
        )}
        {status && <div className={styles.modalStatus}>{status}</div>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onImportPick}
        />
        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>close</button>
          <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>import</button>
          {content != null && (
            <button className={styles.btn} onClick={exportConfig}>export</button>
          )}
          {content != null && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
              {saving ? 'saving…' : 'save'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Files modal ────────────────────────────────────────

function FilesModal({ containerName, onClose }: { containerName: string; onClose: () => void }) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [status, setStatus] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)

  const [listFiles] = useLazyQuery(CONTAINER_LIST_FILES, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerListFiles
      if (r?.status === 'success') setFiles(r.files ?? [])
      else setStatus(r?.error ?? 'list failed')
    },
    onError(e) { setStatus(e.message) },
  })

  const [fetchFile] = useLazyQuery(CONTAINER_DOWNLOAD_FILE, {
    fetchPolicy: 'network-only',
    onCompleted(data) {
      const r = data?.containerDownloadFile
      if (r?.status === 'success') {
        try { setFileContent(atob(r.data)) } catch { setFileContent(r.data) }
      } else setStatus(r?.error ?? 'fetch failed')
    },
    onError(e) { setStatus(e.message) },
  })

  const refresh = useCallback(
    () => listFiles({ variables: { container_name: containerName } }),
    [containerName, listFiles],
  )

  const [writeFile] = useMutation(CONTAINER_WRITE_FILE, {
    onCompleted(data) {
      const r = data?.containerWriteFile
      setStatus(r?.status === 'success' ? 'saved' : (r?.error ?? 'save failed'))
      if (r?.status === 'success') refresh()
    },
    onError(e) { setStatus(e.message) },
  })

  const [removeFile] = useMutation(CONTAINER_REMOVE_FILE, {
    onCompleted(data) {
      const r = data?.containerRemoveFile
      setStatus(r?.status === 'success' ? 'removed' : (r?.error ?? 'remove failed'))
      if (r?.status === 'success') refresh()
    },
    onError(e) { setStatus(e.message) },
  })

  useEffect(() => { refresh() }, [])

  function openFile(f: string) {
    setViewing(f); setFileContent(null); setEditing(false)
    fetchFile({ variables: { container_name: containerName, filename: f } })
  }

  // mirrors Mythic's C2ProfileListFilesDialog upload: readAsBinaryString → btoa, one write per file
  function onUploadPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files
    e.target.value = ''
    if (!picked) return
    setStatus('')
    Array.from(picked).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => {
        const contents = typeof ev.target?.result === 'string' ? ev.target.result : ''
        writeFile({ variables: { container_name: containerName, file_path: file.name, data: btoa(contents) } })
      }
      reader.onerror = () => setStatus('upload read failed')
      reader.readAsBinaryString(file)
    })
  }

  function downloadCurrent() {
    if (fileContent == null || !viewing) return
    const bytes = new Uint8Array(fileContent.length)
    for (let i = 0; i < fileContent.length; i++) bytes[i] = fileContent.charCodeAt(i) & 0xff
    const url = URL.createObjectURL(new Blob([bytes]))
    const a = document.createElement('a')
    a.href = url
    a.download = viewing
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function saveEdit() {
    if (!viewing) return
    setStatus('')
    writeFile({ variables: { container_name: containerName, file_path: viewing, data: btoa(editContent) } })
    setFileContent(editContent)
    setEditing(false)
  }

  function deleteFile(f: string) {
    setStatus('')
    removeFile({ variables: { container_name: containerName, filename: f } })
    if (viewing === f) { setViewing(null); setFileContent(null); setEditing(false) }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>
            {containerName} — {viewing ?? 'files'}
          </span>
          {viewing && (
            <button className={styles.btn} onClick={() => { setViewing(null); setFileContent(null); setEditing(false) }}>
              ← back
            </button>
          )}
          {!viewing && (
            <button className={styles.btn} onClick={() => uploadRef.current?.click()}>upload</button>
          )}
          <input ref={uploadRef} type="file" multiple style={{ display: 'none' }} onChange={onUploadPick} />
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        {!viewing && (
          <>
            {files == null && !status && <div className={styles.modalMsg}>loading…</div>}
            {files != null && files.length === 0 && <div className={styles.modalMsg}>no files</div>}
            {files != null && files.length > 0 && (
              <div className={styles.fileList}>
                {files.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className={styles.fileItem} style={{ flex: 1 }} onClick={() => openFile(f)}>{f}</button>
                    <button className={`${styles.btn} ${styles.btnStop}`} onClick={() => deleteFile(f)}>del</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {viewing && (
          <>
            {fileContent == null && <div className={styles.modalMsg}>loading…</div>}
            {fileContent != null && !editing && <pre className={styles.fileViewPre}>{fileContent}</pre>}
            {fileContent != null && editing && (
              <textarea
                className={styles.configEditor}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                spellCheck={false}
              />
            )}
          </>
        )}

        {status && <div className={styles.modalStatus}>{status}</div>}

        <div className={styles.modalFooter}>
          <button className={styles.btn} onClick={onClose}>close</button>
          {viewing && fileContent != null && !editing && (
            <>
              <button className={styles.btn} onClick={downloadCurrent}>download</button>
              <button className={styles.btn} onClick={() => { setEditing(true); setEditContent(fileContent) }}>edit</button>
            </>
          )}
          {viewing && editing && (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={saveEdit}>save</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Commands panel (inline, not modal) ─────────────────

function CommandsPanel({ agentName }: { agentName: string }) {
  const [commands, setCommands] = useState<AgentCommand[] | null>(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const [fetchCmds] = useLazyQuery(GET_AGENT_COMMANDS, {
    fetchPolicy: 'network-only',
    onCompleted(data) { setCommands(data?.command ?? []) },
    onError(e) { setStatus(e.message) },
  })

  useEffect(() => { fetchCmds({ variables: { payload_name: agentName } }) }, [])

  const filtered = useMemo(() => {
    if (!commands) return []
    const q = search.toLowerCase()
    return q ? commands.filter(c =>
      c.cmd.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    ) : commands
  }, [commands, search])

  if (status) return <div className={styles.inlineMsg}>{status}</div>
  if (!commands) return <div className={styles.inlineMsg}>loading commands…</div>

  return (
    <div className={styles.cmdPanel}>
      <div className={styles.cmdSearch}>
        <input
          className={styles.searchInput}
          placeholder={`search ${commands.length} commands…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.cmdList}>
        {filtered.length === 0 && <div className={styles.inlineMsg}>no results</div>}
        {filtered.map(c => (
          <div key={c.id} className={styles.cmdItem}>
            <div
              className={styles.cmdHeader}
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            >
              <span className={styles.cmdName}>{c.cmd}</span>
              {c.version > 0 && <span className={styles.semver}>v{c.version}</span>}
              <span className={styles.chevron}>{expanded === c.id ? '▾' : '▸'}</span>
            </div>
            {expanded === c.id && (
              <div className={styles.cmdBody}>
                {c.description && <div className={styles.cmdDesc}>{c.description}</div>}
                {c.help_cmd    && <pre className={styles.cmdHelp}>{c.help_cmd}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────

// ── Instances modal ────────────────────────────────────

interface C2ParamDef {
  id: number
  name: string
  parameter_type: string
  default_value: string
  description: string
  required: boolean
  choices: string
}

function InstancesModal({ c2ProfileId, c2ProfileName, onClose }: {
  c2ProfileId: number
  c2ProfileName: string
  onClose: () => void
}) {
  const [selectedInstance, setSelectedInstance] = useState('')
  const [instanceName,     setInstanceName]     = useState('')
  const [params,           setParams]           = useState<Record<string, string>>({})
  const [status,           setStatus]           = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  const { data: profileData, refetch } = useQuery(GET_C2_PROFILE_PARAMS, {
    variables: { id: c2ProfileId },
    fetchPolicy: 'cache-and-network',
  })
  const c2ParamDefs: C2ParamDef[] = profileData?.c2profile_by_pk?.c2profileparameters ?? []
  const instances: string[] = (profileData?.c2profile_by_pk?.c2profileparametersinstances ?? []).map(
    (i: { instance_name: string }) => i.instance_name
  )

  useEffect(() => {
    if (!c2ParamDefs.length) return
    const defaults: Record<string, string> = {}
    for (const p of c2ParamDefs) defaults[p.name] = p.default_value ?? ''
    setParams(defaults)
  }, [profileData])

  const [loadInstance] = useLazyQuery(GET_C2_INSTANCE_VALUES_BY_NAME, { fetchPolicy: 'network-only' })

  const handleSelectInstance = useCallback(async (name: string) => {
    setSelectedInstance(name)
    setInstanceName(name)
    setStatus('')
    if (!name) {
      const defaults: Record<string, string> = {}
      for (const p of c2ParamDefs) defaults[p.name] = p.default_value ?? ''
      setParams(defaults)
      return
    }
    const result = await loadInstance({ variables: { instance_name: name, c2_profile_id: c2ProfileId } })
    const rows: { value: string; c2profileparameter: { name: string } }[] =
      result?.data?.c2profileparametersinstance ?? []
    const loaded: Record<string, string> = {}
    for (const p of c2ParamDefs) loaded[p.name] = p.default_value ?? ''
    for (const row of rows) loaded[row.c2profileparameter.name] = row.value
    setParams(loaded)
  }, [c2ParamDefs, c2ProfileId, loadInstance])

  const [createInstance] = useMutation(CREATE_C2_INSTANCE, {
    onCompleted(data) {
      const r = data.create_c2_instance
      setStatus(r.status === 'success' ? 'Saved.' : (r.error ?? 'Failed'))
      if (r.status === 'success') refetch()
    },
    onError(e) { setStatus(e.message) },
  })

  const [deleteInstance] = useMutation(DELETE_C2_INSTANCE, {
    onCompleted() {
      setStatus('Deleted.')
      setSelectedInstance('')
      setInstanceName('')
      const defaults: Record<string, string> = {}
      for (const p of c2ParamDefs) defaults[p.name] = p.default_value ?? ''
      setParams(defaults)
      refetch()
    },
    onError(e) { setStatus(e.message) },
  })

  const [importInstance] = useMutation(IMPORT_C2_INSTANCE, {
    onCompleted(data) {
      const r = data.import_c2_instance
      setStatus(r.status === 'success' ? 'Imported.' : (r.error ?? 'Import failed'))
      if (r.status === 'success') refetch()
    },
    onError(e) { setStatus(e.message) },
  })

  function handleSave() {
    if (!instanceName.trim()) { setStatus('Instance name required.'); return }
    setStatus('')
    createInstance({
      variables: {
        instance_name: instanceName.trim(),
        c2_instance: JSON.stringify(params),
        c2profile_id: c2ProfileId,
      },
    })
  }

  function handleDelete() {
    if (!selectedInstance) return
    setStatus('')
    deleteInstance({ variables: { name: selectedInstance, c2_profile_id: c2ProfileId } })
  }

  function handleExport() {
    const payload = { instance_name: instanceName || selectedInstance, c2profile_name: c2ProfileName, params }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${c2ProfileName}_${instanceName || selectedInstance || 'instance'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        const name = data.instance_name ?? ''
        const paramValues = data.params ?? data
        importInstance({ variables: { instance_name: name, c2_instance: paramValues, c2profile_name: c2ProfileName } })
      } catch { setStatus('Invalid JSON file.') }
    }
    reader.readAsText(file)
  }

  function setParam(name: string, value: string) {
    setParams(prev => ({ ...prev, [name]: value }))
  }

  function renderParam(p: C2ParamDef) {
    const val = params[p.name] ?? p.default_value ?? ''
    switch (p.parameter_type) {
      case 'Boolean':
        return (
          <label key={p.name} className={styles.instCheckRow}>
            <input type="checkbox" checked={val === 'true'} onChange={e => setParam(p.name, e.target.checked ? 'true' : 'false')} />
            <span className={styles.instParamLabel}>{p.name}</span>
            {p.description && <span className={styles.instParamDesc}>{p.description}</span>}
          </label>
        )
      case 'ChooseOne':
      case 'ChooseOneCustom': {
        let choices: string[] = []
        try { choices = JSON.parse(p.choices) } catch {}
        return (
          <div key={p.name} className={styles.instParamRow}>
            <span className={styles.instParamLabel}>{p.name}</span>
            <select className={styles.instParamInput} value={val} onChange={e => setParam(p.name, e.target.value)}>
              {choices.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )
      }
      case 'Number':
        return (
          <div key={p.name} className={styles.instParamRow}>
            <span className={styles.instParamLabel}>{p.name}</span>
            <input type="number" className={styles.instParamInput} value={val} onChange={e => setParam(p.name, e.target.value)} />
          </div>
        )
      case 'File':
      case 'FileMultiple':
        return (
          <div key={p.name} className={styles.instParamRow}>
            <span className={styles.instParamLabel}>{p.name}</span>
            <span className={styles.instParamDesc}>file upload not supported in instances editor</span>
          </div>
        )
      default:
        return (
          <div key={p.name} className={styles.instParamRow}>
            <span className={styles.instParamLabel}>{p.name}</span>
            <input className={styles.instParamInput} value={val} onChange={e => setParam(p.name, e.target.value)} />
          </div>
        )
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.instModal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Instances — {c2ProfileName}</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.instBody}>
          {/* load / delete / export / import row */}
          <div className={styles.instTopRow}>
            <select
              className={styles.instSelect}
              value={selectedInstance}
              onChange={e => handleSelectInstance(e.target.value)}
            >
              <option value="">— new instance —</option>
              {instances.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {selectedInstance && (
              <button className={`${styles.btn} ${styles.btnStop}`} onClick={handleDelete}>delete</button>
            )}
            <button className={styles.btn} onClick={handleExport}>export</button>
            <label className={styles.btn} style={{ cursor: 'pointer' }}>
              import
              <input
                ref={importRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleImportFile(f); e.target.value = '' } }}
              />
            </label>
          </div>

          {/* instance name */}
          <div className={styles.instParamRow}>
            <span className={styles.instParamLabel}>instance name</span>
            <input
              className={styles.instParamInput}
              placeholder="my-config"
              value={instanceName}
              onChange={e => setInstanceName(e.target.value)}
            />
          </div>

          <div className={styles.instDivider} />

          {/* params */}
          <div className={styles.instParams}>
            {c2ParamDefs.map(p => renderParam(p))}
            {!c2ParamDefs.length && <span className={styles.instParamDesc}>No configurable parameters.</span>}
          </div>
        </div>

        <div className={styles.instFooter}>
          {status && <span className={status.includes('ailed') || status.includes('required') ? styles.errMsg : styles.instOk}>{status}</span>}
          <button className={`${styles.btn} ${styles.btnStart}`} onClick={handleSave}>save</button>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ───────────────────────────────────────

type DetailView = 'info' | 'commands' | 'files'

function DetailPanel({
  name, author, description, semver, container_running,
  docsPath, showCommands, showConfig, showStart, showInstances,
  c2Id, c2Running,
  iconName, extra, actions,
}: {
  name: string
  author?: string
  description?: string
  semver?: string
  container_running: boolean
  docsPath?: string
  showCommands?: boolean
  showConfig?: boolean
  showStart?: boolean
  showInstances?: boolean
  c2Id?: number
  c2Running?: boolean
  iconName?: string
  extra?: React.ReactNode
  actions?: React.ReactNode
}) {
  const [view, setView] = useState<DetailView>('info')
  const [modal, setModal] = useState<'config' | 'files' | 'instances' | null>(null)
  const [c2Status, setC2Status] = useState('')

  const [startStop, { loading: toggling }] = useMutation(START_STOP_C2, {
    onCompleted(data) {
      const r = data?.startStopProfile
      setC2Status(r?.status === 'success' ? '' : (r?.error ?? 'failed'))
    },
    onError(e) { setC2Status(e.message) },
  })

  function toggleC2() {
    if (c2Id == null) return
    setC2Status('')
    startStop({ variables: { id: c2Id, action: c2Running ? 'stop' : 'start' } })
  }

  return (
    <div className={styles.detail}>
      {/* header */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitle}>
          {iconName && <AgentIcon name={iconName} size="md" />}
          <StatusDot running={container_running} />
          <span className={styles.detailName}>{name}</span>
          {semver && <span className={styles.semver}>{semver}</span>}
        </div>
        <div className={styles.detailActions}>
          {showStart && c2Id != null && (
            <button
              className={`${styles.btn} ${c2Running ? styles.btnStop : styles.btnStart}`}
              onClick={toggleC2}
              disabled={toggling}
            >
              {toggling ? '…' : c2Running ? 'stop' : 'start'}
            </button>
          )}
          {actions}
          {showConfig && (
            <button className={styles.btn} onClick={() => setModal('config')}>config</button>
          )}
          {showInstances && (
            <button className={styles.btn} onClick={() => setModal('instances')}>instances</button>
          )}
          <button className={styles.btn} onClick={() => setModal('files')}>files</button>
          {docsPath && (
            <a className={styles.btn} href={docsPath} target="_blank" rel="noreferrer">docs</a>
          )}
          {c2Status && <span className={styles.errMsg}>{c2Status}</span>}
        </div>
      </div>

      {/* sub-tabs */}
      <div className={styles.detailTabs}>
        <button
          className={`${styles.subTab} ${view === 'info' ? styles.subTabActive : ''}`}
          onClick={() => setView('info')}
        >
          info
        </button>
        {showCommands && (
          <button
            className={`${styles.subTab} ${view === 'commands' ? styles.subTabActive : ''}`}
            onClick={() => setView('commands')}
          >
            commands
          </button>
        )}
      </div>

      {/* body */}
      <div className={styles.detailBody}>
        {view === 'info' && (
          <div className={styles.infoSection}>
            {description && <p className={styles.descText}>{description}</p>}
            {author  && <MetaRow label="author">{author}</MetaRow>}
            {extra}
          </div>
        )}
        {view === 'commands' && showCommands && (
          <CommandsPanel agentName={name} />
        )}
      </div>

      {modal === 'config' && showConfig && (
        <ConfigModal containerName={name} onClose={() => setModal(null)} />
      )}
      {modal === 'files' && (
        <FilesModal containerName={name} onClose={() => setModal(null)} />
      )}
      {modal === 'instances' && showInstances && c2Id != null && (
        <InstancesModal c2ProfileId={c2Id} c2ProfileName={name} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

// ── List row ───────────────────────────────────────────

function ListRow({
  name, running, selected, badges, onClick, iconName,
}: {
  name: string; running: boolean; selected: boolean
  badges?: React.ReactNode; onClick: () => void; iconName?: string
}) {
  return (
    <button
      className={`${styles.listRow} ${selected ? styles.listRowActive : ''}`}
      onClick={onClick}
    >
      {iconName && <AgentIcon name={iconName} size="sm" />}
      <StatusDot running={running} />
      <span className={styles.listName}>{name}</span>
      {badges}
    </button>
  )
}

// ── Tab panels ─────────────────────────────────────────

function AgentsPane() {
  const { data } = useSubscription(SUB_PAYLOAD_TYPES)
  const types: PayloadType[] = data?.payloadtype ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = types.find(t => t.id === sel) ?? types[0] ?? null

  if (!types.length) return <div className={styles.empty}>No agent containers registered.</div>

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {types.map(pt => (
          <ListRow
            key={pt.id}
            name={pt.name}
            running={pt.container_running}
            selected={(sel ?? types[0]?.id) === pt.id}
            onClick={() => setSel(pt.id)}
            iconName={pt.name}
            badges={<>
              {pt.wrapper && <span className={styles.badge}>WRAP</span>}
              {pt.agent_type && pt.agent_type !== 'agent' && (
                <span className={styles.badge}>{pt.agent_type.toUpperCase()}</span>
              )}
            </>}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.note}
          semver={selected.semver}
          container_running={selected.container_running}
          docsPath={`/docs/${selected.wrapper ? 'wrappers' : 'agents'}/${selected.name.toLowerCase()}`}
          showCommands={!selected.wrapper}
          iconName={selected.name}
          extra={<>
            {selected.supported_os?.length > 0 && (
              <MetaRow label="os">
                <div className={styles.chips}>
                  {selected.supported_os.map(o => <Chip key={o} label={o} />)}
                </div>
              </MetaRow>
            )}
            {selected.translationcontainer && (
              <MetaRow label="translation">
                <StatusDot running={selected.translationcontainer.container_running} />
                {' '}{selected.translationcontainer.name}
              </MetaRow>
            )}
            {selected.wrap_these_payload_types.length > 0 && (
              <MetaRow label="wraps">
                {selected.wrap_these_payload_types.map(w => w.wrapped.name).join(', ')}
              </MetaRow>
            )}
          </>}
        />
      )}
    </div>
  )
}

function C2Pane() {
  const { data } = useSubscription(SUB_C2_PROFILES)
  const profiles: C2Profile[] = data?.c2profile ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = profiles.find(p => p.id === sel) ?? profiles[0] ?? null

  if (!profiles.length) return <div className={styles.empty}>No C2 profiles registered.</div>

  const agents = selected?.payloadtypec2profiles.filter(x => !x.payloadtype.deleted).map(x => x.payloadtype.name) ?? []

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {profiles.map(p => (
          <ListRow
            key={p.id}
            name={p.name}
            running={p.container_running}
            selected={(sel ?? profiles[0]?.id) === p.id}
            onClick={() => setSel(p.id)}
            iconName={p.name}
            badges={<>
              {p.is_p2p
                ? <span className={styles.badge}>P2P</span>
                : <span className={`${styles.badge} ${p.running ? styles.badgeOn : styles.badgeOff}`}>
                    {p.running ? 'on' : 'off'}
                  </span>
              }
            </>}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.description}
          semver={selected.semver}
          container_running={selected.container_running}
          docsPath={`/docs/c2-profiles/${selected.name.toLowerCase()}`}
          showConfig
          showInstances
          showStart={!selected.is_p2p}
          iconName={selected.name}
          c2Id={selected.id}
          c2Running={selected.running}
          extra={<>
            <MetaRow label="type">{selected.is_p2p ? 'P2P (agent-handled)' : 'Egress'}</MetaRow>
            {agents.length > 0 && (
              <MetaRow label="agents">
                <div className={styles.chips}>
                  {agents.map(a => <Chip key={a} label={a} />)}
                </div>
              </MetaRow>
            )}
          </>}
        />
      )}
    </div>
  )
}

function TranslationPane() {
  const { data } = useSubscription(SUB_TRANSLATION_CONTAINERS)
  const containers: TranslationContainer[] = data?.translationcontainer ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = containers.find(c => c.id === sel) ?? containers[0] ?? null

  if (!containers.length) return <div className={styles.empty}>No translation containers registered.</div>

  const activeTypes = selected?.payloadtypes.filter(p => !p.deleted) ?? []

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {containers.map(tc => (
          <ListRow
            key={tc.id}
            name={tc.name}
            running={tc.container_running}
            selected={(sel ?? containers[0]?.id) === tc.id}
            onClick={() => setSel(tc.id)}
          />
        ))}
      </div>
      {selected && (
        <DetailPanel
          key={selected.id}
          name={selected.name}
          author={selected.author}
          description={selected.description}
          semver={selected.semver}
          container_running={selected.container_running}
          extra={activeTypes.length > 0 && (
            <MetaRow label="agents">
              <div className={styles.chips}>
                {activeTypes.map(p => <Chip key={p.id} label={p.name} />)}
              </div>
            </MetaRow>
          )}
        />
      )}
    </div>
  )
}

interface ParsedSub { name: string; description?: string; type?: string }

// Type-aware detail for a consuming container — mirrors Mythic's ConsumingServicesTable.
// webhook/logging → test-event buttons, eventing → function/description table,
// auth → per-IDP metadata fetch. All types → delete + view files (via DetailPanel).
function ConsumingDetailPanel({ service }: { service: ConsumingService }) {
  const [status, setStatus] = useState('')
  const [idpName, setIdpName] = useState<string | null>(null)
  const [idpMeta, setIdpMeta] = useState<string | null>(null)

  const [toggleDelete] = useMutation(TOGGLE_CONSUMING_DELETE, {
    onCompleted() { setStatus('deleted') },
    onError(e) { setStatus(e.message) },
  })
  const [testWebhook] = useMutation(TEST_WEBHOOK, {
    onCompleted(d) {
      const r = d?.consumingServicesTestWebhook
      setStatus(r?.status === 'success' ? 'test sent' : (r?.error ?? 'no webhook listening'))
    },
    onError(e) { setStatus(e.message) },
  })
  const [testLog] = useMutation(TEST_LOG, {
    onCompleted(d) {
      const r = d?.consumingServicesTestLog
      setStatus(r?.status === 'success' ? 'test sent' : (r?.error ?? 'no logger listening'))
    },
    onError(e) { setStatus(e.message) },
  })
  const [fetchIdp] = useLazyQuery(GET_IDP_METADATA, {
    fetchPolicy: 'network-only',
    onCompleted(d) {
      const r = d?.consumingContainerGetIDPMetadata
      if (r?.status === 'success') { setIdpMeta(r.metadata); setStatus('') }
      else { setIdpMeta(null); setStatus(r?.error ?? 'fetch failed') }
    },
    onError(e) { setStatus(e.message) },
  })

  const subs = service.subscriptions ?? []
  const parsed: ParsedSub[] = useMemo(() => {
    if (service.type === 'eventing' || service.type === 'auth') {
      return subs.map(s => {
        try {
          const o = JSON.parse(s)
          return { name: o.name ?? '', description: o.description ?? '', type: o.type ?? '' }
        } catch { return { name: s } }
      })
    }
    return subs.map(s => ({ name: s }))
  }, [service])

  const actions = (
    <button
      className={`${styles.btn} ${styles.btnStop}`}
      onClick={() => { setStatus(''); toggleDelete({ variables: { id: service.id, deleted: true } }) }}
    >
      delete
    </button>
  )

  const testRow = (events: string[], fire: (ev: string) => void, label: string) => (
    <MetaRow label={label}>
      <div className={styles.chips}>
        {events.map(ev => (
          <button
            key={ev}
            className={styles.btn}
            disabled={!subs.includes(ev) || !service.container_running}
            onClick={() => { setStatus(''); fire(ev) }}
          >
            {ev}
          </button>
        ))}
      </div>
    </MetaRow>
  )

  const extra = (
    <>
      <MetaRow label="type">{service.type}</MetaRow>
      {service.type === 'webhook' &&
        testRow(WEBHOOK_EVENTS, ev => testWebhook({ variables: { service_type: ev } }), 'test events')}
      {service.type === 'logging' &&
        testRow(LOGGING_EVENTS, ev => testLog({ variables: { service_type: ev } }), 'test events')}
      {service.type === 'eventing' && parsed.map((s, i) => (
        <MetaRow key={i} label={s.name}>{s.description}</MetaRow>
      ))}
      {service.type === 'auth' && parsed.length > 0 && (
        <MetaRow label="idps">
          <div className={styles.chips}>
            {parsed.map((s, i) => (
              <button
                key={i}
                className={styles.btn}
                disabled={!service.container_running}
                onClick={() => {
                  setStatus(''); setIdpMeta(null); setIdpName(s.name)
                  fetchIdp({ variables: { container_name: service.name, idp_name: s.name } })
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </MetaRow>
      )}
      {idpMeta != null && (
        <MetaRow label={idpName ?? 'metadata'}>
          <pre className={styles.fileViewPre}>{idpMeta}</pre>
        </MetaRow>
      )}
      {status && <div className={styles.modalStatus}>{status}</div>}
    </>
  )

  return (
    <DetailPanel
      name={service.name}
      description={service.description}
      semver={service.semver}
      container_running={service.container_running}
      actions={actions}
      extra={extra}
    />
  )
}

function ConsumingPane() {
  const { data } = useSubscription(SUB_CONSUMING_SERVICES)
  const services: ConsumingService[] = data?.consuming_container ?? []
  const [sel, setSel] = useState<number | null>(null)
  const selected = services.find(s => s.id === sel) ?? services[0] ?? null

  if (!services.length) return <div className={styles.empty}>No consuming services registered.</div>

  return (
    <div className={styles.splitPane}>
      <div className={styles.listPane}>
        {services.map(s => (
          <ListRow
            key={s.id}
            name={s.name}
            running={s.container_running}
            selected={(sel ?? services[0]?.id) === s.id}
            onClick={() => setSel(s.id)}
            badges={s.type ? <span className={styles.badge}>{s.type.toUpperCase()}</span> : undefined}
          />
        ))}
      </div>
      {selected && <ConsumingDetailPanel key={selected.id} service={selected} />}
    </div>
  )
}

// ── Panel root ─────────────────────────────────────────

type Tab = 'agents' | 'c2' | 'translation' | 'consuming'

export function ServicesPanel() {
  const [tab, setTab] = useState<Tab>('agents')

  const TABS: { id: Tab; label: string }[] = [
    { id: 'agents',      label: 'Agents' },
    { id: 'c2',          label: 'C2 Profiles' },
    { id: 'translation', label: 'Translation' },
    { id: 'consuming',   label: 'Consuming' },
  ]

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Installed Services</span>
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        {tab === 'agents'      && <AgentsPane />}
        {tab === 'c2'          && <C2Pane />}
        {tab === 'translation' && <TranslationPane />}
        {tab === 'consuming'   && <ConsumingPane />}
      </div>
    </div>
  )
}
