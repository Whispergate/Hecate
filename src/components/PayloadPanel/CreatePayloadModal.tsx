/* ═══════════════════════════════════════════════════
   src/components/PayloadPanel/CreatePayloadModal.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useSubscription } from '@apollo/client'
import { uploadTaskFile } from '@/uploadTaskFile'
import {
  GET_PAYLOAD_TYPES,
  GET_COMMANDS_FOR_TYPE,
  GET_WRAPPABLE_PAYLOADS,
  CREATE_PAYLOAD,
  SUB_PAYLOAD_BUILD,
} from '@/apollo/operations'
import type { Payload } from './PayloadPanel'
import styles from './CreatePayloadModal.module.css'

// ── Pre-fill helpers ───────────────────────────────────

interface InitialConfig {
  os:          string
  description: string
  filename:    string
  buildParams: Record<string, string>
  c2Name:      string
  c2Params:    Record<string, string>
  commands:    string[]
}

function decodeB64(b64: string | undefined | null): string {
  if (!b64) return ''
  try { return decodeURIComponent(escape(atob(b64))) } catch { return b64 ?? '' }
}

function payloadToInitialConfig(payload: Payload): InitialConfig {
  const buildParams: Record<string, string> = {}
  for (const inst of payload.buildparameterinstances)
    buildParams[inst.buildparameter.name] = inst.value

  const c2Name = payload.c2profileparametersinstances[0]
    ?.c2profileparameter.c2profile.name ?? ''

  const c2Params: Record<string, string> = {}
  for (const inst of payload.c2profileparametersinstances)
    if (inst.c2profileparameter.c2profile.name === c2Name)
      c2Params[inst.c2profileparameter.name] = inst.value

  return {
    os:          payload.os,
    description: payload.description,
    filename:    decodeB64(payload.filemetum?.filename_text) || payload.payloadtype.name,
    buildParams,
    c2Name,
    c2Params,
    commands:    payload.payloadcommands.map(pc => pc.command.cmd),
  }
}

// ── Types ──────────────────────────────────────────────

interface DictChoice {
  name:          string
  default_value: string
  default_show:  boolean
  required:      boolean
}

interface HideCondition {
  name:    string
  operand: string  // eq, neq, in, nin, lt, gt, lte, gte, sw, ew, co, nco
  value:   string
  choices: string[]
}

interface Param {
  id:              number
  name:            string
  description:     string
  parameter_type:  string
  default_value:   string
  required:        boolean
  randomize:       boolean
  format_string:   string
  // string[] for ChooseOne/Multiple; DictChoice[] for Dictionary
  choices:         string[] | DictChoice[]
  crypto_type:     boolean
  hide_conditions: HideCondition[]
  ui_position:     number
}

function evalHideConditions(param: Param, allValues: Record<string, string>): boolean {
  if (!param.hide_conditions?.length) return false
  for (const cond of param.hide_conditions) {
    const other = String(allValues[cond.name] ?? '')
    const val   = String(cond.value ?? '')
    let hide = false
    switch (cond.operand) {
      case 'eq':  hide = other === val; break
      case 'neq': hide = other !== val; break
      case 'in':  hide = (cond.choices ?? []).includes(other); break
      case 'nin': hide = !(cond.choices ?? []).includes(other); break
      case 'lt':  hide = parseFloat(other) < parseFloat(val); break
      case 'gt':  hide = parseFloat(other) > parseFloat(val); break
      case 'lte': hide = parseFloat(other) <= parseFloat(val); break
      case 'gte': hide = parseFloat(other) >= parseFloat(val); break
      case 'sw':  hide = other.startsWith(val); break
      case 'ew':  hide = other.endsWith(val); break
      case 'co':  hide = other.includes(val); break
      case 'nco': hide = !other.includes(val); break
    }
    if (hide) return true
  }
  return false
}

// Build the rendered default for a Dictionary param from its choices
function dictDefaultFromChoices(p: Param): string {
  if (p.parameter_type !== 'Dictionary') return p.default_value ?? ''
  if (p.default_value) return p.default_value
  const choices = p.choices as DictChoice[]
  if (!Array.isArray(choices) || choices.length === 0) return '{}'
  const obj: Record<string, string> = {}
  for (const c of choices) {
    if (c.default_show) obj[c.name] = c.default_value
  }
  return JSON.stringify(obj, null, 2)
}

interface C2Profile {
  id:                  number
  name:                string
  is_p2p:              boolean
  description:         string
  c2profileparameters: Param[]
}

interface C2Deviation {
  supported:         boolean
  default_value?:    unknown
  choices?:          string[]
  dictionary_choices?: DictChoice[]
}

interface PayloadType {
  id:                      number
  name:                    string
  file_extension:          string
  supported_os:            string[]
  note:                    string
  container_running:       boolean
  wrapper:                 boolean
  // { "HTTP": { "query_path_name": { supported: false }, ... }, ... }
  c2_parameter_deviations: Record<string, Record<string, C2Deviation>> | null
  wrap_these_payload_types: { wrapped: { id: number; name: string } }[]
  buildparameters:         Param[]
  payloadtypec2profiles:   { c2profile: C2Profile }[]
}

interface Command {
  id:          number
  cmd:         string
  description: string
}

// ── Helpers ────────────────────────────────────────────

// Mythic stores file_extension without a leading dot (e.g. "exe", "bin").
// Join cleanly so "apollo" + "exe" = "apollo.exe", and a value like ".exe"
// also works without doubling.
function defaultFilename(name: string, ext?: string): string {
  if (!ext) return name
  return ext.startsWith('.') ? `${name}${ext}` : `${name}.${ext}`
}

function coerce(value: string, type: string): unknown {
  switch (type) {
    case 'Number':
    case 'Integer':        return isNaN(Number(value)) ? value : Number(value)
    case 'Boolean':        return value === 'true'
    case 'Array':
    case 'TypedArray':
    case 'FileMultiple':   return value.split(',').map(s => s.trim()).filter(Boolean)
    case 'ChooseMultiple': return value.split(',').filter(Boolean)
    case 'Dictionary': {
      try { return JSON.parse(value) } catch { return value }
    }
    default: return value
  }
}

// Build the `payloadDefinition` JSON string for the mutation
function buildDefinition(opts: {
  type:            PayloadType
  os:              string
  description:     string
  filename:        string
  buildParams:     Record<string, string>
  c2Name:          string
  c2Profile:       C2Profile | null
  c2Params:        Record<string, string>
  commands:        string[]
  wrappedUuid?:    string
}): string {
  const { type, os, description, filename, buildParams, c2Name, c2Profile, c2Params, commands, wrappedUuid } = opts

  const buildParameters = type.buildparameters.map(p => ({
    name:  p.name,
    value: coerce(buildParams[p.name] ?? p.default_value, p.parameter_type),
  }))

  if (type.wrapper) {
    return JSON.stringify({
      description,
      payload_type:    type.name,
      selected_os:     os,
      filename,
      commands:        [],
      build_parameters: buildParameters,
      c2_profiles:     [],
      wrapper:         true,
      wrapped_payload: wrappedUuid ?? '',
    })
  }

  const c2ProfileParameters: Record<string, unknown> = {}
  if (c2Profile) {
    for (const p of c2Profile.c2profileparameters) {
      const val = c2Params[p.name]
      if (p.crypto_type && p.randomize && !val) continue
      c2ProfileParameters[p.name] = coerce(val ?? p.default_value, p.parameter_type)
    }
  }

  return JSON.stringify({
    description,
    payload_type: type.name,
    selected_os:  os,
    filename,
    commands,
    build_parameters:  buildParameters,
    c2_profiles: c2Name ? [{
      c2_profile:            c2Name,
      c2_profile_is_p2p:     c2Profile?.is_p2p ?? false,
      c2_profile_parameters: c2ProfileParameters,
    }] : [],
  })
}

// ── Dynamic parameter input ────────────────────────────

function ParamInput({
  param, value, onChange, onPickFiles, allValues,
}: {
  param: Param
  value: string
  onChange: (v: string) => void
  onPickFiles?: (files: File[]) => void
  allValues: Record<string, string>
}) {
  if (evalHideConditions(param, allValues)) return null

  const { parameter_type: type, description, name, default_value, randomize } = param
  const choices = param.choices as string[]
  const label = name.replace(/_/g, ' ')
  // crypto_type params with randomize=true are auto-generated if left empty
  const cryptoHint = param.crypto_type && randomize ? 'auto-generated if empty' : null

  if (type === 'ChooseOne') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
        {cryptoHint && <span className={styles.cryptoHint}>{cryptoHint}</span>}
        <select
          className={styles.fieldSelect}
          value={value !== '' ? value : default_value}
          onChange={e => onChange(e.target.value)}
        >
          {(choices ?? []).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    )
  }

  if (type === 'ChooseOneCustom') {
    const isCustom = value !== '' && !(choices ?? []).includes(value)
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
        <select
          className={styles.fieldSelect}
          value={isCustom ? '__custom__' : (value !== '' ? value : default_value)}
          onChange={e => onChange(e.target.value === '__custom__' ? '' : e.target.value)}
        >
          {(choices ?? []).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__custom__">custom…</option>
        </select>
        {(isCustom || value === '') && (
          <input
            className={styles.fieldInput}
            placeholder="custom value"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        )}
      </div>
    )
  }

  if (type === 'ChooseMultiple') {
    const selected = new Set((value !== '' ? value : default_value).split(',').filter(Boolean))
    const toggle = (c: string) => {
      const next = new Set(selected)
      next.has(c) ? next.delete(c) : next.add(c)
      onChange(Array.from(next).join(','))
    }
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
        <div className={styles.choiceList}>
          {(choices ?? []).map(c => (
            <label key={c} className={styles.choiceItem}>
              <input
                type="checkbox"
                className={styles.cmdCheck}
                checked={selected.has(c)}
                onChange={() => toggle(c)}
              />
              <span className={styles.choiceItemLabel}>{c}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'Boolean') {
    return (
      <div className={styles.fieldRow}>
        <input
          type="checkbox"
          id={`param-${name}`}
          className={styles.fieldCheck}
          checked={(value || default_value) === 'true'}
          onChange={e => onChange(e.target.checked ? 'true' : 'false')}
        />
        <label htmlFor={`param-${name}`} className={styles.fieldLabelInline}>
          {label}
          {description && <span className={styles.fieldHint}>{description}</span>}
        </label>
      </div>
    )
  }

  if (type === 'File' || type === 'FileMultiple') {
    const multiple = type === 'FileMultiple'
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
        <input
          type="file"
          multiple={multiple}
          className={styles.fieldInput}
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            onPickFiles?.(files)
            onChange(files.map(f => f.name).join(', '))
          }}
        />
        {value && <span className={styles.fieldHint}>selected: {value}</span>}
      </div>
    )
  }

  if (type === 'Date') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
        <input
          type="date"
          className={styles.fieldInput}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (type === 'None') return null

  const isMultiline = type === 'Dictionary' || type === 'Array' || type === 'TypedArray'
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {label}
        {param.required && <span className={styles.required}>*</span>}
      </label>
      {description && <span className={styles.fieldHint}>{description}</span>}
      {cryptoHint && <span className={styles.cryptoHint}>{cryptoHint}</span>}
      {isMultiline ? (
        <textarea
          className={styles.fieldTextarea}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={type === 'Array' ? 'comma, separated, values' : '{"key": "value"}'}
        />
      ) : (
        <input
          type={type === 'Number' || type === 'Integer' ? 'number' : 'text'}
          className={styles.fieldInput}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={param.crypto_type && randomize ? 'auto-generated' : undefined}
        />
      )}
    </div>
  )
}

// ── Wrapped payload picker ─────────────────────────────

interface WrappablePayload {
  id: number; uuid: string; description: string; creation_time: string
  filemetum: { filename_text: string } | null
  agentName?: string
}

function WrappedPayloadPicker({
  typeId, value, onChange,
}: {
  typeId: number; value: string; onChange: (uuid: string) => void
}) {
  const [filter, setFilter] = useState('')
  const { data, loading } = useQuery(GET_WRAPPABLE_PAYLOADS, {
    variables: { wrapper_type_id: typeId },
    fetchPolicy: 'cache-and-network',
  })

  const options: WrappablePayload[] = []
  if (data?.payloadtype_by_pk?.wrap_these_payload_types) {
    for (const wt of data.payloadtype_by_pk.wrap_these_payload_types) {
      for (const p of wt.wrapped.payloads ?? []) {
        options.push({ ...p, agentName: wt.wrapped.name })
      }
    }
    options.sort((a, b) =>
      new Date(b.creation_time).getTime() - new Date(a.creation_time).getTime()
    )
  }

  if (loading) return <div className={styles.loading}>Loading payloads…</div>
  if (!options.length) return (
    <div className={styles.noParams}>No wrappable payloads found. Build a supported payload first.</div>
  )

  const q = filter.toLowerCase()
  const visible = options.filter(p => {
    const b64 = p.filemetum?.filename_text
    const name = b64 ? decodeURIComponent(escape(atob(b64))) : (p.description || p.uuid)
    return name.toLowerCase().includes(q)
      || (p.agentName ?? '').toLowerCase().includes(q)
      || (p.description ?? '').toLowerCase().includes(q)
  })

  return (
    <div className={styles.wrapListWrap}>
      <input
        className={styles.cmdSearch}
        type="text"
        placeholder="filter payloads…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
    <div className={styles.wrapList}>
      {visible.map(p => {
        const b64 = p.filemetum?.filename_text
        const filename = b64
          ? decodeURIComponent(escape(atob(b64)))
          : (p.description || p.uuid.slice(0, 12))
        const isSelected = value === p.uuid
        return (
          <button
            key={p.uuid}
            className={`${styles.wrapItem} ${isSelected ? styles.wrapItemSelected : ''}`}
            onClick={() => onChange(p.uuid)}
          >
            <span className={styles.wrapItemAgent}>{p.agentName}</span>
            <span className={styles.wrapItemFile}>{filename}</span>
            {p.description && (
              <span className={styles.wrapItemDesc}>{p.description}</span>
            )}
          </button>
        )
      })}
      {visible.length === 0 && (
        <div className={styles.noParams}>No matching payloads.</div>
      )}
    </div>
    </div>
  )
}

// ── Step 1: Pick agent ─────────────────────────────────

function PickAgent({
  types, onPick,
}: {
  types: PayloadType[]; onPick: (t: PayloadType) => void
}) {
  return (
    <div className={styles.pickGrid}>
      {types.map(t => (
        <button
          key={t.id}
          className={`${styles.agentCard} ${!t.container_running ? styles.agentOffline : ''}`}
          onClick={() => onPick(t)}
        >
          <div className={styles.agentCardTop}>
            <span className={styles.agentCardName}>{t.name}</span>
            {t.wrapper && <span className={styles.wrapperBadge}>WRAPPER</span>}
            <span className={`${styles.agentDot} ${t.container_running ? styles.agentDotOn : styles.agentDotOff}`} />
          </div>
          {(t.supported_os as string[]).length > 0 && (
            <div className={styles.osList}>
              {(t.supported_os as string[]).map(os => (
                <span key={os} className={styles.osChip}>{os}</span>
              ))}
            </div>
          )}
          {t.note && <div className={styles.agentNote}>{t.note}</div>}
        </button>
      ))}
      {types.length === 0 && (
        <div className={styles.emptyPick}>No agent containers running.</div>
      )}
    </div>
  )
}

// ── Step 2: Configure ──────────────────────────────────

function Configure({
  type, onBack, onBuild, initialConfig,
}: {
  type: PayloadType
  onBack: () => void
  onBuild: (def: string) => void
  initialConfig?: InitialConfig
}) {
  const osList: string[] = type.supported_os?.length > 0
    ? type.supported_os
    : ['Windows', 'Linux', 'macOS']

  const [os,          setOs]          = useState(initialConfig?.os ?? osList[0] ?? 'Windows')
  const [description, setDescription] = useState(initialConfig?.description ?? '')
  const [filename,    setFilename]    = useState(
    initialConfig?.filename ?? defaultFilename(type.name, type.file_extension)
  )
  const [buildParams, setBuildParams] = useState<Record<string, string>>(() => {
    if (initialConfig?.buildParams && Object.keys(initialConfig.buildParams).length > 0)
      return initialConfig.buildParams
    const defaults: Record<string, string> = {}
    for (const p of type.buildparameters) {
      if (p.crypto_type && p.randomize) continue
      let def: string
      if (p.parameter_type === 'Dictionary') {
        def = dictDefaultFromChoices(p)
      } else if (p.parameter_type === 'Date' && p.default_value) {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(p.default_value, 10))
        def = d.toISOString().slice(0, 10)
      } else {
        def = p.default_value ?? ''
      }
      if (def) defaults[p.name] = def
    }
    return defaults
  })
  const [selectedC2,  setSelectedC2]  = useState<string>(
    initialConfig?.c2Name ?? type.payloadtypec2profiles[0]?.c2profile.name ?? ''
  )

  const defaultsForC2 = useCallback((profile: C2Profile | null, c2Name?: string): Record<string, string> => {
    const defaults: Record<string, string> = {}
    if (!profile) return defaults
    for (const p of profile.c2profileparameters) {
      if (p.crypto_type && p.randomize) continue
      const dev = type.c2_parameter_deviations?.[c2Name ?? profile.name]?.[p.name]
      if (dev?.supported === false) continue
      let def: string
      if (p.parameter_type === 'Dictionary') {
        def = dictDefaultFromChoices(p)
      } else if (p.parameter_type === 'Date' && p.default_value) {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(p.default_value, 10))
        def = d.toISOString().slice(0, 10)
      } else {
        def = p.default_value ?? ''
      }
      if (def) defaults[p.name] = def
    }
    return defaults
  }, [type])

  const firstC2Name = type.payloadtypec2profiles[0]?.c2profile.name ?? ''
  const [c2Params, setC2Params] = useState<Record<string, string>>(() => {
    if (initialConfig?.c2Params && Object.keys(initialConfig.c2Params).length > 0)
      return initialConfig.c2Params
    return defaultsForC2(type.payloadtypec2profiles[0]?.c2profile ?? null, firstC2Name)
  })
  const [selectedCmds, setSelectedCmds] = useState<Set<string>>(new Set())
  const [allCmds,      setAllCmds]      = useState<Command[]>([])
  const [cmdsLoaded,   setCmdsLoaded]   = useState(false)
  const [cmdFilter,    setCmdFilter]    = useState('')
  const [wrappedUuid,  setWrappedUuid]  = useState('')

  const { data: cmdData } = useQuery(GET_COMMANDS_FOR_TYPE, {
    variables: { payload_type_id: type.id },
    skip: type.wrapper,
  })

  useEffect(() => {
    if (cmdData?.command) {
      const cmds: Command[] = cmdData.command
      setAllCmds(cmds)
      if (initialConfig?.commands.length) {
        const available = new Set(cmds.map(c => c.cmd))
        setSelectedCmds(new Set(initialConfig.commands.filter(c => available.has(c))))
      } else {
        setSelectedCmds(new Set(cmds.map((c: Command) => c.cmd)))
      }
      setCmdsLoaded(true)
    }
  }, [cmdData])

  const c2Profile = type.payloadtypec2profiles
    .find(p => p.c2profile.name === selectedC2)?.c2profile ?? null

  const setBuildParam  = useCallback((name: string, v: string) =>
    setBuildParams(prev => ({ ...prev, [name]: v })), [])
  const setC2Param     = useCallback((name: string, v: string) =>
    setC2Params(prev => ({ ...prev, [name]: v })), [])
  const toggleCmd      = useCallback((cmd: string) =>
    setSelectedCmds(prev => {
      const next = new Set(prev)
      next.has(cmd) ? next.delete(cmd) : next.add(cmd)
      return next
    }), [])
  const toggleAllCmds  = useCallback(() =>
    setSelectedCmds(prev =>
      prev.size === allCmds.length ? new Set() : new Set(allCmds.map(c => c.cmd))
    ), [allCmds])

  const visibleBuildParams = [...type.buildparameters].sort((a, b) => a.name.localeCompare(b.name))

  // Picked files waiting to be uploaded. Key format: "build:<name>" or "c2:<name>"
  // For File:        files[0] is uploaded, value becomes the UUID
  // For FileMultiple files are all uploaded, value becomes "uuid1,uuid2,..."
  const fileMapRef = useRef<Map<string, File[]>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  function setFiles(key: string, files: File[]) {
    fileMapRef.current.set(key, files)
  }

  async function uploadAll(): Promise<{ build: Record<string, string>; c2: Record<string, string> } | null> {
    const token = sessionStorage.getItem('hecate_token') ?? ''
    const build: Record<string, string> = {}
    const c2:    Record<string, string> = {}

    for (const [key, files] of fileMapRef.current.entries()) {
      const uuids: string[] = []
      for (const f of files) {
        const id = await uploadTaskFile(f, token, `Build param ${key} for ${filename}`)
        if (!id) { setUploadErr(`Failed to upload ${f.name}`); return null }
        uuids.push(id)
      }
      const value = uuids.join(',')
      if (key.startsWith('build:'))   build[key.slice(6)] = value
      else if (key.startsWith('c2:')) c2[key.slice(3)]    = value
    }
    return { build, c2 }
  }

  const handleBuild = async () => {
    setUploadErr(null)
    setUploading(true)
    try {
      const uploaded = fileMapRef.current.size > 0 ? await uploadAll() : { build: {}, c2: {} }
      if (!uploaded) return
      const def = buildDefinition({
        type, os, description, filename: filename || defaultFilename(type.name, type.file_extension),
        buildParams: { ...buildParams, ...uploaded.build },
        c2Name: selectedC2, c2Profile,
        c2Params:    { ...c2Params,    ...uploaded.c2 },
        commands: Array.from(selectedCmds),
        wrappedUuid,
      })
      onBuild(def)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.configure}>
      {/* Header */}
      <div className={styles.configHeader}>
        <button className={styles.backBtn} onClick={onBack}>← back</button>
        <span className={styles.typeBadge}>{type.name}</span>
      </div>

      {/* OS selector */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Operating System</div>
        <div className={styles.osSelect}>
          {osList.map(o => (
            <button
              key={o}
              className={`${styles.osBtn} ${os === o ? styles.osBtnActive : ''}`}
              onClick={() => setOs(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Basic info */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Identity</div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Description</label>
          <input
            className={styles.fieldInput}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="optional description"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Filename</label>
          <input
            className={styles.fieldInput}
            value={filename}
            onChange={e => setFilename(e.target.value)}
          />
        </div>
      </div>

      {/* Build parameters */}
      {visibleBuildParams.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Build Parameters</div>
          {visibleBuildParams.map(p => (
            <ParamInput
              key={p.id}
              param={p}
              value={buildParams[p.name] ?? ''}
              onChange={v => setBuildParam(p.name, v)}
              onPickFiles={files => setFiles(`build:${p.name}`, files)}
              allValues={buildParams}
            />
          ))}
        </div>
      )}

      {/* Wrapper: select payload to wrap */}
      {type.wrapper && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Payload to Wrap</div>
          <WrappedPayloadPicker
            typeId={type.id}
            value={wrappedUuid}
            onChange={setWrappedUuid}
          />
        </div>
      )}

      {/* C2 profile (regular payloads only) */}
      {!type.wrapper && type.payloadtypec2profiles.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>C2 Profile</div>
          <div className={styles.c2Tabs}>
            {type.payloadtypec2profiles.map(({ c2profile: p }) => (
              <button
                key={p.id}
                className={`${styles.c2Tab} ${selectedC2 === p.name ? styles.c2TabActive : ''}`}
                onClick={() => {
                  setSelectedC2(p.name)
                  const prof = type.payloadtypec2profiles.find(x => x.c2profile.name === p.name)?.c2profile ?? null
                  setC2Params(defaultsForC2(prof, p.name))
                }}
              >
                {p.name}
                {p.is_p2p && <span className={styles.p2pBadge}>P2P</span>}
              </button>
            ))}
          </div>
          {c2Profile && (
            <div className={styles.c2Params}>
              {[...c2Profile.c2profileparameters]
                .filter(p => {
                  const dev = type.c2_parameter_deviations?.[selectedC2]?.[p.name]
                  return dev?.supported !== false
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(p => (
                  <ParamInput
                    key={p.id}
                    param={p}
                    value={c2Params[p.name] ?? ''}
                    onChange={v => setC2Param(p.name, v)}
                    onPickFiles={files => setFiles(`c2:${p.name}`, files)}
                    allValues={c2Params}
                  />
                ))}
              {c2Profile.c2profileparameters.length === 0 && (
                <div className={styles.noParams}>No configurable parameters.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Commands (regular payloads only) */}
      {!type.wrapper && <div className={styles.section}>
        <div className={styles.sectionLabelRow}>
          <span className={styles.sectionLabel}>
            Commands
            {cmdsLoaded && (
              <span className={styles.cmdCount}>
                {selectedCmds.size}/{allCmds.length}
              </span>
            )}
          </span>
          {cmdsLoaded && (
            <button className={styles.toggleAllBtn} onClick={toggleAllCmds}>
              {selectedCmds.size === allCmds.length ? 'deselect all' : 'select all'}
            </button>
          )}
        </div>
        {!cmdsLoaded && <div className={styles.loading}>Loading commands…</div>}
        {cmdsLoaded && (
          <>
            <input
              className={styles.cmdSearch}
              type="text"
              placeholder="filter commands…"
              value={cmdFilter}
              onChange={e => setCmdFilter(e.target.value)}
            />
            <div className={styles.cmdGrid}>
              {allCmds
                .filter(c => c.cmd.includes(cmdFilter.toLowerCase()))
                .map(c => (
                  <label key={c.id} className={styles.cmdLabel} title={c.description}>
                    <input
                      type="checkbox"
                      checked={selectedCmds.has(c.cmd)}
                      onChange={() => toggleCmd(c.cmd)}
                      className={styles.cmdCheck}
                    />
                    <span className={styles.cmdName}>{c.cmd}</span>
                  </label>
                ))
              }
            </div>
          </>
        )}
      </div>}

      {/* Actions */}
      <div className={styles.actions}>
        {uploadErr && <span className={styles.fieldHint} style={{ color: 'var(--status-err-text)' }}>{uploadErr}</span>}
        <button className={styles.buildBtn} onClick={handleBuild} disabled={uploading}>
          {uploading ? 'Uploading files…' : 'Build Payload'}
        </button>
      </div>
    </div>
  )
}

// ── Build step types ────────────────────────────────────

interface BuildStep {
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

// ── Step 3: Building ───────────────────────────────────

function BuildStepRow({
  step, running, isFirst, isLast,
}: {
  step: BuildStep; running: boolean; isFirst: boolean; isLast: boolean
}) {
  const [open, setOpen] = useState(false)
  const done      = !!step.end_time
  const hasOutput = !!(step.step_stdout || step.step_stderr)

  const dotCls = running && !done
    ? styles.stepDotRunning
    : done && step.step_success
    ? styles.stepDotOk
    : done && !step.step_success
    ? styles.stepDotErr
    : styles.stepDotPending

  return (
    <div className={styles.buildStepRow}>
      {/* ── Timeline column ── */}
      <div className={styles.buildStepTimeline}>
        <div className={`${styles.stepLine} ${isFirst ? styles.stepLineInvis : ''}`} />
        <button
          className={`${styles.stepBubble} ${dotCls}`}
          onClick={() => setOpen(o => !o)}
          title={hasOutput ? 'Click to view output' : step.step_description}
        />
        <div className={`${styles.stepLine} ${isLast && !open ? styles.stepLineInvis : ''}`} />
      </div>

      {/* ── Content column ── */}
      <div className={styles.buildStepBody}>
        <div className={styles.buildStepHeader} onClick={() => setOpen(o => !o)}>
          <span className={styles.buildStepName}>{step.step_name}</span>
          {step.step_description && (
            <span className={styles.buildStepDesc}>{step.step_description}</span>
          )}
          <span className={styles.buildStepChevron}>{open ? '▾' : '▸'}</span>
        </div>
        {open && (
          <div className={styles.buildStepOutput}>
            {step.step_description && (
              <div className={styles.buildStepDescFull}>{step.step_description}</div>
            )}
            {step.step_stdout && (
              <>
                <span className={styles.buildStepOutputLabel}>stdout</span>
                <pre className={styles.buildStepStdout}>{step.step_stdout}</pre>
              </>
            )}
            {step.step_stderr && (
              <>
                <span className={styles.buildStepOutputLabel}>stderr</span>
                <pre className={styles.buildStepStderr}>{step.step_stderr}</pre>
              </>
            )}
            {!step.step_stdout && !step.step_stderr && (
              <span className={styles.buildStepNoOutput}>no output</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Building({
  uuid, onClose,
}: {
  uuid: string; onClose: () => void
}) {
  const { data } = useSubscription(SUB_PAYLOAD_BUILD, {
    variables: { uuid },
  })

  const result  = data?.payload?.[0]
  const phase: string   = result?.build_phase ?? 'building'
  const message: string = result?.build_message ?? ''
  const stderr: string  = result?.build_stderr  ?? ''
  const fileId: string  = result?.filemetum?.agent_file_id ?? ''
  const steps: BuildStep[] = result?.payload_build_steps ?? []

  const isDone = phase === 'success' || phase === 'error' || phase === 'cancelled'
  const isOk   = phase === 'success'

  // Which step is currently running (has start_time but no end_time)
  const runningIdx = steps.findIndex(s => s.start_time && !s.end_time)

  return (
    <div className={styles.building}>
      <div className={styles.buildStatus}>
        <span className={`${styles.buildDot} ${
          phase === 'success'   ? styles.buildOk   :
          phase === 'error'     ? styles.buildErr  :
          phase === 'cancelled' ? styles.buildWarn :
          styles.buildPulse
        }`} />
        <span className={styles.buildPhaseLabel}>{phase}</span>
      </div>

      <div className={styles.buildUuid}>
        <span className={styles.buildUuidLabel}>UUID</span>
        <code className={styles.buildUuidVal}>{uuid}</code>
      </div>

      {/* Build step chain */}
      {steps.length > 0 && (
        <div className={styles.buildStepChain}>
          {steps.map((s, i) => (
            <BuildStepRow
              key={s.id}
              step={s}
              running={i === runningIdx}
              isFirst={i === 0}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>
      )}

      {message && <div className={styles.buildMsg}>{message}</div>}
      {stderr && phase === 'error' && <pre className={styles.buildStderr}>{stderr}</pre>}

      {isOk && fileId && (
        <a className={styles.dlBtnLg} href={`/direct/download/${fileId}`} download>
          ↓ Download Payload
        </a>
      )}

      {isDone && (
        <button className={styles.doneBtn} onClick={onClose}>
          {isOk ? 'Done' : 'Close'}
        </button>
      )}
    </div>
  )
}

// ── Modal root ─────────────────────────────────────────

export function CreatePayloadModal({
  onClose,
  initialPayload,
}: {
  onClose: () => void
  initialPayload?: Payload
}) {
  const [step, setStep]         = useState<'pick' | 'configure' | 'building'>('pick')
  const [selType, setSelType]   = useState<PayloadType | null>(null)
  const [initialConfig, setInitialConfig] = useState<InitialConfig | undefined>(undefined)
  const [buildUuid, setBuildUuid] = useState('')
  const [buildError, setBuildError] = useState('')

  const { data, loading } = useQuery(GET_PAYLOAD_TYPES, {
    fetchPolicy: 'cache-and-network',
  })
  const types: PayloadType[] = data?.payloadtype ?? []

  // When rebuilding with edits: find the matching type and jump to configure
  useEffect(() => {
    if (!initialPayload || !types.length) return
    const match = types.find(t => t.name === initialPayload.payloadtype.name)
    if (match) {
      setSelType(match)
      setInitialConfig(payloadToInitialConfig(initialPayload))
      setStep('configure')
    }
  }, [initialPayload, types])

  const [createPayload, { loading: creating }] = useMutation(CREATE_PAYLOAD)

  const handleBuild = useCallback(async (definition: string) => {
    setBuildError('')
    try {
      const { data: res } = await createPayload({ variables: { payloadDefinition: definition } })
      const result = res?.createPayload
      if (result?.status === 'success' && result?.uuid) {
        setBuildUuid(result.uuid)
        setStep('building')
      } else {
        setBuildError(result?.error ?? 'Unknown error from Mythic')
      }
    } catch (e: unknown) {
      setBuildError(e instanceof Error ? e.message : String(e))
    }
  }, [createPayload])

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>

        {/* ── Modal header ── */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleRow}>
            <span className={styles.modalTitle}>New Payload</span>
            <div className={styles.stepDots}>
              {(['pick', 'configure', 'building'] as const).map((s, i) => (
                <span key={s} className={`${styles.stepDot} ${step === s ? styles.stepDotActive : ''}`}>{i+1}</span>
              ))}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className={styles.modalBody}>
          {buildError && (
            <div className={styles.errorBanner}>{buildError}</div>
          )}

          {step === 'pick' && (
            loading
              ? <div className={styles.loading}>Loading agents…</div>
              : <PickAgent types={types} onPick={t => { setSelType(t); setStep('configure') }} />
          )}

          {step === 'configure' && selType && (
            <Configure
              type={selType}
              onBack={() => { setStep('pick'); setInitialConfig(undefined) }}
              onBuild={handleBuild}
              initialConfig={initialConfig}
            />
          )}

          {creating && step === 'configure' && (
            <div className={styles.creatingOverlay}>
              <span className={styles.creatingSpinner}>Building…</span>
            </div>
          )}

          {step === 'building' && (
            <Building uuid={buildUuid} onClose={onClose} />
          )}
        </div>

      </div>
    </div>
  )
}
