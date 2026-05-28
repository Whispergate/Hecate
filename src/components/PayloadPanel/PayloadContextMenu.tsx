/* src/components/PayloadPanel/PayloadContextMenu.tsx */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation } from '@apollo/client'
import {
  UPDATE_PAYLOAD_DESCRIPTION,
  RENAME_PAYLOAD_FILE,
  CREATE_PAYLOAD,
} from '@/apollo/operations'
import type { Payload, C2ParamInstance } from './PayloadPanel'
import styles from './PayloadContextMenu.module.css'

// ── helpers ───────────────────────────────────────────

function decodeFilename(b64: string | undefined | null): string {
  if (!b64) return ''
  try { return decodeURIComponent(escape(atob(b64))) } catch { return b64 ?? '' }
}


function buildDefinition(p: Payload, filename: string): string {
  const byProfile = new Map<string, { is_p2p: boolean; params: Record<string, string> }>()
  for (const inst of p.c2profileparametersinstances) {
    const prof = inst.c2profileparameter.c2profile.name
    if (!byProfile.has(prof)) byProfile.set(prof, { is_p2p: inst.c2profileparameter.c2profile.is_p2p, params: {} })
    byProfile.get(prof)!.params[inst.c2profileparameter.name] = inst.value
  }

  const isWrapper = p.payloadtype.wrapper
  return JSON.stringify({
    description:      p.description,
    payload_type:     p.payloadtype.name,
    selected_os:      p.os,
    filename,
    commands:         isWrapper ? [] : p.payloadcommands.map(pc => pc.command.cmd),
    build_parameters: p.buildparameterinstances.map(b => ({ name: b.buildparameter.name, value: b.value })),
    c2_profiles: isWrapper ? [] : [...byProfile.entries()].map(([name, v]) => ({
      c2_profile:            name,
      c2_profile_is_p2p:     v.is_p2p,
      c2_profile_parameters: v.params,
    })),
    ...(isWrapper ? { wrapper: true, wrapped_payload: p.wrapped_payload?.uuid ?? '' } : {}),
  })
}

function exportConfig(p: Payload, filename: string) {
  const isWrapper = p.payloadtype.wrapper
  const obj = {
    payload_type:     p.payloadtype.name,
    os:               p.os,
    description:      p.description,
    filename,
    uuid:             p.uuid,
    commands:         isWrapper ? [] : p.payloadcommands.map(pc => pc.command.cmd),
    build_parameters: p.buildparameterinstances.map(b => ({ name: b.buildparameter.name, value: b.value })),
    c2_profiles: isWrapper ? {} : (() => {
      const m = new Map<string, Record<string, string>>()
      for (const inst of p.c2profileparametersinstances) {
        const prof = inst.c2profileparameter.c2profile.name
        if (!m.has(prof)) m.set(prof, {})
        m.get(prof)![inst.c2profileparameter.name] = inst.value
      }
      return Object.fromEntries(m)
    })(),
    ...(isWrapper ? { wrapper: true, wrapped_payload: p.wrapped_payload?.uuid ?? '' } : {}),
  }
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${p.payloadtype.name}_${p.uuid.slice(0, 8)}_config.json`
  a.click()
  URL.revokeObjectURL(url)
}

function collectIocs(p: Payload): { label: string; value: string }[] {
  const iocs: { label: string; value: string }[] = []
  const callbackHostParams = ['callback_host', 'host', 'callback_address']
  const callbackPortParams = ['callback_port', 'port']

  const byProfile = new Map<string, Record<string, string>>()
  for (const inst of p.c2profileparametersinstances) {
    const prof = inst.c2profileparameter.c2profile.name
    if (!byProfile.has(prof)) byProfile.set(prof, {})
    byProfile.get(prof)![inst.c2profileparameter.name] = inst.value
  }

  for (const [prof, params] of byProfile.entries()) {
    const host = callbackHostParams.map(k => params[k]).find(Boolean)
    const port = callbackPortParams.map(k => params[k]).find(Boolean)
    if (host) iocs.push({ label: `${prof} callback`, value: port ? `${host}:${port}` : host })
  }

  const fname = decodeFilename(p.filemetum?.filename_text)
  if (fname) iocs.push({ label: 'filename', value: fname })
  if (p.filemetum?.md5)  iocs.push({ label: 'MD5',  value: p.filemetum.md5 })
  if (p.filemetum?.sha1) iocs.push({ label: 'SHA1', value: p.filemetum.sha1 })
  iocs.push({ label: 'UUID', value: p.uuid })

  return iocs
}

// ── compare helpers ───────────────────────────────────

interface ParamRow { key: string; a: string; b: string; diff: boolean }

function compareParams(a: Payload, b: Payload): ParamRow[] {
  const allKeys = new Set<string>()
  const aMap = new Map<string, string>()
  const bMap = new Map<string, string>()

  for (const inst of a.c2profileparametersinstances) {
    const k = `${inst.c2profileparameter.c2profile.name} / ${inst.c2profileparameter.name}`
    aMap.set(k, inst.value); allKeys.add(k)
  }
  for (const inst of b.c2profileparametersinstances) {
    const k = `${inst.c2profileparameter.c2profile.name} / ${inst.c2profileparameter.name}`
    bMap.set(k, inst.value); allKeys.add(k)
  }
  for (const inst of a.buildparameterinstances) {
    const k = `build / ${inst.buildparameter.name}`
    aMap.set(k, inst.value); allKeys.add(k)
  }
  for (const inst of b.buildparameterinstances) {
    const k = `build / ${inst.buildparameter.name}`
    bMap.set(k, inst.value); allKeys.add(k)
  }

  return [...allKeys].sort().map(k => ({
    key:  k,
    a:    aMap.get(k) ?? '—',
    b:    bMap.get(k) ?? '—',
    diff: (aMap.get(k) ?? '') !== (bMap.get(k) ?? ''),
  }))
}

// ── component ─────────────────────────────────────────

type View = 'menu' | 'editDesc' | 'rename' | 'iocs' | 'compare' | 'confirmBuild'

interface Props {
  payload:          Payload
  payloads:         Payload[]   // for compare picker
  x:                number
  y:                number
  onClose:          () => void
  onRebuilt:        () => void  // refetch after trigger new build
  onRebuildWithEdits: () => void
}

export function PayloadContextMenu({ payload, payloads, x, y, onClose, onRebuilt, onRebuildWithEdits }: Props) {
  const menuRef  = useRef<HTMLDivElement>(null)
  const [view,   setView]    = useState<View>('menu')
  const [desc,   setDesc]    = useState(payload.description)
  const [newName, setNewName] = useState(decodeFilename(payload.filemetum?.filename_text))
  const [compareId, setCompareId] = useState<number | null>(null)
  const [buildStatus, setBuildStatus] = useState<'idle'|'building'|'ok'|'err'>('idle')
  const [renameStatus, setRenameStatus] = useState<'idle'|'ok'|'err'>('idle')
  const [copied, setCopied] = useState<string | null>(null)

  const [updateDesc]  = useMutation(UPDATE_PAYLOAD_DESCRIPTION)
  const [renameFile]  = useMutation(RENAME_PAYLOAD_FILE)
  const [createPayload] = useMutation(CREATE_PAYLOAD)

  const filename = decodeFilename(payload.filemetum?.filename_text)

  useEffect(() => {
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') view === 'menu' ? onClose() : setView('menu') }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose, view])

  const [pos, setPos] = useState<{ top: number; left: number }>({ top: y, left: x })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const m = 8
    // Clamp in real viewport coords (clientX/Y, innerWidth/Height, getBoundingClientRect
    // all live there), then divide by --ui-scale because position: fixed inside the
    // transformed #root resolves top/left in #root's local space.
    const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1
    setPos({
      top:  Math.max(m, Math.min(y, window.innerHeight - r.height - m)) / s,
      left: Math.max(m, Math.min(x, window.innerWidth  - r.width  - m)) / s,
    })
  }, [x, y, view, compareId])

  const style: React.CSSProperties = {
    position: 'fixed',
    top:  pos.top,
    left: pos.left,
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  // ── Edit description ──────────────────────────────

  const submitDesc = async () => {
    const res = await updateDesc({ variables: { payload_uuid: payload.uuid, description: desc } })
    if (res.data?.updatePayload?.status === 'success') onRebuilt()
  }

  // ── Rename file ───────────────────────────────────

  const submitRename = async () => {
    if (!payload.filemetum?.id || !newName.trim()) return
    try {
      await renameFile({
        variables: {
          file_id: payload.filemetum.id,
          filename: newName.trim(),
        },
      })
      setRenameStatus('ok')
      setTimeout(onRebuilt, 600)
    } catch {
      setRenameStatus('err')
    }
  }

  // ── Trigger new build ─────────────────────────────

  const triggerBuild = async () => {
    setBuildStatus('building')
    try {
      const def = buildDefinition(payload, filename || `${payload.payloadtype.name}`)
      const res = await createPayload({ variables: { payloadDefinition: def } })
      const status = res.data?.createPayload?.status
      setBuildStatus(status === 'success' ? 'ok' : 'err')
      if (status === 'success') { onRebuilt(); setTimeout(onClose, 800) }
    } catch {
      setBuildStatus('err')
    }
  }

  // ── Export config ─────────────────────────────────

  const handleExport = () => {
    exportConfig(payload, filename)
    onClose()
  }

  // ── Views ─────────────────────────────────────────

  if (view === 'editDesc') return (
    <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
      <div className={styles.header}>Edit description</div>
      <textarea
        className={styles.input}
        value={desc}
        onChange={e => setDesc(e.target.value)}
        autoFocus rows={3}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitDesc() } }}
      />
      <div className={styles.rowActions}>
        <button className={styles.btnPrimary} onClick={submitDesc}>Save</button>
        <button className={styles.btnSecondary} onClick={() => setView('menu')}>Back</button>
      </div>
    </div>
  )

  if (view === 'rename') return (
    <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
      <div className={styles.header}>Rename file</div>
      <input
        className={styles.input}
        value={newName}
        onChange={e => setNewName(e.target.value)}
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') submitRename() }}
      />
      {renameStatus === 'ok'  && <div className={styles.statusOk}>Renamed ✓</div>}
      {renameStatus === 'err' && <div className={styles.statusErr}>Failed — mutation may not be exposed</div>}
      <div className={styles.rowActions}>
        <button className={styles.btnPrimary} onClick={submitRename}>Rename</button>
        <button className={styles.btnSecondary} onClick={() => setView('menu')}>Back</button>
      </div>
    </div>
  )

  if (view === 'iocs') {
    const iocs = collectIocs(payload)
    return (
      <div ref={menuRef} className={styles.menu} style={{ ...style, minWidth: 280 }} onContextMenu={e => e.preventDefault()}>
        <div className={styles.header}>Indicators of Compromise</div>
        <div className={styles.iocList}>
          {iocs.map(({ label, value }) => (
            <div key={label} className={styles.iocRow}>
              <span className={styles.iocLabel}>{label}</span>
              <span
                className={styles.iocValue}
                onClick={() => copyToClipboard(value, label)}
                title="Click to copy"
              >
                {copied === label ? '✓ copied' : value}
              </span>
            </div>
          ))}
          {iocs.length === 0 && <div className={styles.empty}>No IOCs extractable from current data</div>}
        </div>
        <div className={styles.rowActions}>
          <button className={styles.btnSecondary} onClick={() => setView('menu')}>Back</button>
        </div>
      </div>
    )
  }

  if (view === 'compare') {
    const other = payloads.find(p => p.id === compareId) ?? null
    const rows  = other ? compareParams(payload, other) : []
    const diffs = rows.filter(r => r.diff)
    return (
      <div ref={menuRef} className={styles.menu} style={{ ...style, minWidth: 340 }} onContextMenu={e => e.preventDefault()}>
        <div className={styles.header}>Compare configuration</div>
        <select
          className={styles.select}
          value={compareId ?? ''}
          onChange={e => setCompareId(Number(e.target.value) || null)}
        >
          <option value="">— select payload —</option>
          {payloads.filter(p => p.id !== payload.id).map(p => (
            <option key={p.id} value={p.id}>
              {p.payloadtype.name} · {p.description || p.uuid.slice(0, 12)}
            </option>
          ))}
        </select>

        {other && (() => {
          const asCmds = new Set(payload.payloadcommands.map(pc => pc.command.cmd))
          const bsCmds = new Set(other.payloadcommands.map(pc => pc.command.cmd))
          const onlyA  = [...asCmds].filter(c => !bsCmds.has(c)).sort()
          const onlyB  = [...bsCmds].filter(c => !asCmds.has(c)).sort()
          const hasCmdDiff = onlyA.length > 0 || onlyB.length > 0
          const identical  = diffs.length === 0 && rows.length > 0 && !hasCmdDiff
          return (
            <div className={styles.diffWrap}>
              <div className={styles.diffHeader}>
                <span>{payload.payloadtype.name}</span>
                <span>{other.payloadtype.name}</span>
              </div>

              {identical && <div className={styles.empty}>Configurations are identical</div>}

              {diffs.map(r => (
                <div key={r.key} className={styles.diffRow}>
                  <div className={styles.diffKey}>{r.key}</div>
                  <div className={styles.diffCells}>
                    <span className={styles.diffA}>{r.a}</span>
                    <span className={styles.diffB}>{r.b}</span>
                  </div>
                </div>
              ))}

              {hasCmdDiff && (
                <div className={styles.diffRow}>
                  <div className={styles.diffKey}>commands</div>
                  <div className={styles.diffCells}>
                    <div className={styles.cmdDiffCol}>
                      {onlyA.map(c => <span key={c} className={styles.cmdOnly}>{c}</span>)}
                      {onlyA.length === 0 && <span className={styles.diffNone}>—</span>}
                    </div>
                    <div className={styles.cmdDiffCol}>
                      {onlyB.map(c => <span key={c} className={styles.cmdOnlyB}>{c}</span>)}
                      {onlyB.length === 0 && <span className={styles.diffNone}>—</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
        <div className={styles.rowActions}>
          <button className={styles.btnSecondary} onClick={() => setView('menu')}>Back</button>
        </div>
      </div>
    )
  }

  if (view === 'confirmBuild') return (
    <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
      <div className={styles.header}>Trigger new build?</div>
      <div className={styles.confirmText}>
        Rebuild {payload.payloadtype.name} with identical configuration.
      </div>
      {buildStatus === 'ok'       && <div className={styles.statusOk}>Build queued ✓</div>}
      {buildStatus === 'err'      && <div className={styles.statusErr}>Build failed</div>}
      {buildStatus === 'building' && <div className={styles.statusInfo}>Building…</div>}
      {buildStatus === 'idle' && (
        <div className={styles.rowActions}>
          <button className={styles.btnPrimary} onClick={triggerBuild}>Build</button>
          <button className={styles.btnSecondary} onClick={() => setView('menu')}>Back</button>
        </div>
      )}
    </div>
  )

  // ── Main menu ─────────────────────────────────────

  return (
    <div ref={menuRef} className={styles.menu} style={style} onContextMenu={e => e.preventDefault()}>
      <div className={styles.header}>
        {payload.payloadtype.name} · {(filename || payload.uuid).slice(0, 20)}
      </div>

      <button className={styles.item} onClick={() => setView('rename')}>
        Rename file
      </button>
      <button className={styles.item} onClick={() => setView('editDesc')}>
        Edit description
      </button>
      <button className={styles.item} onClick={() => setView('compare')}>
        Compare configuration
      </button>

      <div className={styles.divider} />

      <button className={styles.item} onClick={() => setView('confirmBuild')}>
        Trigger new build
      </button>
      <button className={styles.item} onClick={() => { onClose(); onRebuildWithEdits() }}>
        Trigger new build with edits
      </button>

      <div className={styles.divider} />

      <button className={styles.item} onClick={handleExport}>
        Export payload config
      </button>
      <button className={styles.item} onClick={() => setView('iocs')}>
        Generate IOCs
      </button>
    </div>
  )
}
