/* ═══════════════════════════════════════════════════
   src/components/PayloadPanel/CreatePayloadModal.tsx
   ═══════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useSubscription } from '@apollo/client'
import {
  GET_PAYLOAD_TYPES,
  GET_COMMANDS_FOR_TYPE,
  CREATE_PAYLOAD,
  SUB_PAYLOAD_BUILD,
} from '@/apollo/operations'
import styles from './CreatePayloadModal.module.css'

// ── Types ──────────────────────────────────────────────

interface Param {
  id:             number
  name:           string
  description:    string
  parameter_type: string
  default_value:  string
  required:       boolean
  randomize:      boolean
  choices:        string[]
  crypto_type:    boolean
}

interface C2Profile {
  id:                  number
  name:                string
  is_p2p:              boolean
  description:         string
  c2profileparameters: Param[]
}

interface PayloadType {
  id:                   number
  name:                 string
  file_extension:       string
  supported_os:         string[]
  note:                 string
  container_running:    boolean
  buildparameters:      Param[]
  payloadtypec2profiles: { c2profile: C2Profile }[]
}

interface Command {
  id:          number
  cmd:         string
  description: string
}

// ── Helpers ────────────────────────────────────────────

function coerce(value: string, type: string): unknown {
  switch (type) {
    case 'Number':
    case 'Integer':        return isNaN(Number(value)) ? value : Number(value)
    case 'Boolean':        return value === 'true'
    case 'Array':
    case 'TypedArray':     return value.split(',').map(s => s.trim()).filter(Boolean)
    case 'ChooseMultiple': return value.split(',').filter(Boolean)
    case 'Dictionary': {
      try { return JSON.parse(value) } catch { return value }
    }
    default: return value
  }
}

// Build the `payloadDefinition` JSON string for the mutation
function buildDefinition(opts: {
  type:         PayloadType
  os:           string
  description:  string
  filename:     string
  buildParams:  Record<string, string>
  c2Name:       string
  c2Profile:    C2Profile | null
  c2Params:     Record<string, string>
  commands:     string[]
}): string {
  const { type, os, description, filename, buildParams, c2Name, c2Profile, c2Params, commands } = opts

  const buildParameters = type.buildparameters
    .filter(p => !p.crypto_type)
    .map(p => ({
      name:  p.name,
      value: coerce(buildParams[p.name] ?? p.default_value, p.parameter_type),
    }))

  const c2ProfileParameters: Record<string, unknown> = {}
  if (c2Profile) {
    for (const p of c2Profile.c2profileparameters) {
      if (p.crypto_type) continue
      c2ProfileParameters[p.name] = coerce(c2Params[p.name] ?? p.default_value, p.parameter_type)
    }
  }

  const def = {
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
  }
  return JSON.stringify(def)
}

// ── Dynamic parameter input ────────────────────────────

function ParamInput({
  param, value, onChange,
}: {
  param: Param; value: string; onChange: (v: string) => void
}) {
  if (param.crypto_type) return null

  const { parameter_type: type, choices, description, name, default_value } = param
  const label = name.replace(/_/g, ' ')

  if (type === 'ChooseOne') {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>
          {label}
          {param.required && <span className={styles.required}>*</span>}
        </label>
        {description && <span className={styles.fieldHint}>{description}</span>}
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
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{label}</label>
        <span className={styles.fieldNote}>File parameters must be configured in Mythic after building.</span>
      </div>
    )
  }

  const isMultiline = type === 'Dictionary' || type === 'Array' || type === 'TypedArray'
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>
        {label}
        {param.required && <span className={styles.required}>*</span>}
      </label>
      {description && <span className={styles.fieldHint}>{description}</span>}
      {isMultiline ? (
        <textarea
          className={styles.fieldTextarea}
          value={value || default_value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={type === 'Array' ? 'comma, separated, values' : '{"key": "value"}'}
        />
      ) : (
        <input
          type={type === 'Number' || type === 'Integer' ? 'number' : 'text'}
          className={styles.fieldInput}
          value={value !== undefined ? value : default_value}
          onChange={e => onChange(e.target.value)}
        />
      )}
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
  type, onBack, onBuild,
}: {
  type: PayloadType
  onBack: () => void
  onBuild: (def: string) => void
}) {
  const osList: string[] = type.supported_os?.length > 0
    ? type.supported_os
    : ['Windows', 'Linux', 'macOS']

  const [os,          setOs]          = useState(osList[0] ?? 'Windows')
  const [description, setDescription] = useState('')
  const [filename,    setFilename]    = useState(`${type.name}${type.file_extension ?? ''}`)
  const [buildParams, setBuildParams] = useState<Record<string, string>>({})
  const [selectedC2,  setSelectedC2]  = useState<string>(
    type.payloadtypec2profiles[0]?.c2profile.name ?? ''
  )
  const [c2Params, setC2Params] = useState<Record<string, string>>({})
  const [selectedCmds, setSelectedCmds] = useState<Set<string>>(new Set())
  const [allCmds,      setAllCmds]      = useState<Command[]>([])
  const [cmdsLoaded,   setCmdsLoaded]   = useState(false)
  const [cmdFilter,    setCmdFilter]    = useState('')

  const { data: cmdData } = useQuery(GET_COMMANDS_FOR_TYPE, {
    variables: { payload_type_id: type.id },
  })

  useEffect(() => {
    if (cmdData?.command) {
      const cmds: Command[] = cmdData.command
      setAllCmds(cmds)
      setSelectedCmds(new Set(cmds.map((c: Command) => c.cmd)))
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

  const visibleBuildParams = type.buildparameters.filter(p => !p.crypto_type)

  const handleBuild = () => {
    const def = buildDefinition({
      type, os, description, filename: filename || `${type.name}${type.file_extension ?? ''}`,
      buildParams, c2Name: selectedC2, c2Profile, c2Params,
      commands: Array.from(selectedCmds),
    })
    onBuild(def)
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
            />
          ))}
        </div>
      )}

      {/* C2 profile */}
      {type.payloadtypec2profiles.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>C2 Profile</div>
          <div className={styles.c2Tabs}>
            {type.payloadtypec2profiles.map(({ c2profile: p }) => (
              <button
                key={p.id}
                className={`${styles.c2Tab} ${selectedC2 === p.name ? styles.c2TabActive : ''}`}
                onClick={() => { setSelectedC2(p.name); setC2Params({}) }}
              >
                {p.name}
                {p.is_p2p && <span className={styles.p2pBadge}>P2P</span>}
              </button>
            ))}
          </div>
          {c2Profile && (
            <div className={styles.c2Params}>
              {c2Profile.c2profileparameters
                .filter(p => !p.crypto_type)
                .map(p => (
                  <ParamInput
                    key={p.id}
                    param={p}
                    value={c2Params[p.name] ?? ''}
                    onChange={v => setC2Param(p.name, v)}
                  />
                ))
              }
              {c2Profile.c2profileparameters.filter(p => !p.crypto_type).length === 0 && (
                <div className={styles.noParams}>No configurable parameters.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Commands */}
      <div className={styles.section}>
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
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.buildBtn} onClick={handleBuild}>
          Build Payload
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Building ───────────────────────────────────

function Building({
  uuid, onClose,
}: {
  uuid: string; onClose: () => void
}) {
  const { data } = useSubscription(SUB_PAYLOAD_BUILD, {
    variables: { uuid },
  })

  const result = data?.payload?.[0]
  const phase: string = result?.build_phase ?? 'building'
  const message: string = result?.build_message ?? ''
  const stderr: string  = result?.build_stderr  ?? ''
  const fileId: string  = result?.filemetum?.agent_file_id ?? ''

  const isDone   = phase === 'success' || phase === 'error' || phase === 'cancelled'
  const isOk     = phase === 'success'

  return (
    <div className={styles.building}>
      <div className={styles.buildStatus}>
        <span className={`${styles.buildDot} ${
          phase === 'success'  ? styles.buildOk  :
          phase === 'error'    ? styles.buildErr :
          phase === 'cancelled'? styles.buildWarn:
          styles.buildPulse
        }`} />
        <span className={styles.buildPhaseLabel}>{phase}</span>
      </div>

      <div className={styles.buildUuid}>
        <span className={styles.buildUuidLabel}>UUID</span>
        <code className={styles.buildUuidVal}>{uuid}</code>
      </div>

      {message && (
        <div className={styles.buildMsg}>{message}</div>
      )}

      {stderr && phase === 'error' && (
        <pre className={styles.buildStderr}>{stderr}</pre>
      )}

      {isOk && fileId && (
        <a
          className={styles.dlBtnLg}
          href={`/direct/download/${fileId}`}
          download
        >
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

export function CreatePayloadModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]         = useState<'pick' | 'configure' | 'building'>('pick')
  const [selType, setSelType]   = useState<PayloadType | null>(null)
  const [buildUuid, setBuildUuid] = useState('')
  const [buildError, setBuildError] = useState('')

  const { data, loading } = useQuery(GET_PAYLOAD_TYPES, {
    fetchPolicy: 'cache-and-network',
  })
  const types: PayloadType[] = data?.payloadtype ?? []

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
              onBack={() => setStep('pick')}
              onBuild={handleBuild}
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
