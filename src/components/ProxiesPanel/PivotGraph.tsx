/* ═══════════════════════════════════════════════════
   src/components/ProxiesPanel/PivotGraph.tsx
   ═══════════════════════════════════════════════════ */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import type { Callback, CallbackPort, HecateStore } from '@/store'
import { parseTs } from '@/components/Sidebar/utils'
import styles from './PivotGraph.module.css'

// ── Late check-in (identical to RightPanel) ───────────

function parseSleepSeconds(cb: Callback): number {
  const raw = cb.sleep_info?.trim()
  if (raw) {
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw) as Record<string, { interval?: number }>
        const first = Object.values(obj)[0]
        if (first?.interval !== undefined) return first.interval
      } catch { /* fall through */ }
    } else {
      const token = raw.toLowerCase().split(/\s+/)[0]
      if (token.endsWith('h')) return parseFloat(token) * 3600
      if (token.endsWith('m')) return parseFloat(token) * 60
      if (token.endsWith('s')) return parseFloat(token)
      const n = parseFloat(token)
      if (!isNaN(n)) return n
    }
  }
  if (cb.tasks[0]) {
    try {
      const p = JSON.parse(cb.tasks[0].params) as { interval?: number }
      if (p.interval !== undefined) return p.interval
    } catch { /* fall through */ }
  }
  const iv = cb.payload.c2profileparametersinstances
    .find(p => p.c2profileparameter.name === 'callback_interval')?.value
  return iv !== undefined ? parseFloat(iv) : 0
}

export function isLateCheckin(cb: Callback): boolean {
  if (cb.last_checkin?.startsWith('1970-01-01')) return false
  const sleepSecs = parseSleepSeconds(cb)
  const elapsed   = (Date.now() - parseTs(cb.last_checkin).getTime()) / 1000
  const threshold = sleepSecs > 0 ? sleepSecs + 300 : 300
  return elapsed > threshold
}

// ── Geometry constants ────────────────────────────────
const NODE_R      = 22
const C2_HEX_R    = 22
const MIN_ORBIT   = 130
const NODE_GAP    = 62    // diameter + spacing between node edges
const MIN_SCALE   = 0.2
const MAX_SCALE   = 6
const VBW         = 620
const VBH         = 520
const CX          = VBW / 2
const CY          = VBH / 2

// ── Helpers ───────────────────────────────────────────

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 - 30) * Math.PI / 180
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

type ProtoInfo = { color: string; dash?: string; short: string }
function protoInfo(name: string): ProtoInfo {
  const n = name.toLowerCase()
  if (n.includes('http'))  return { color: 'var(--proto-http)',    short: 'HTTP' }
  if (n.includes('smb'))   return { color: 'var(--proto-smb)',     short: 'SMB',  dash: '5 3' }
  if (n.includes('tcp'))   return { color: 'var(--proto-tcp)',     short: 'TCP',  dash: '3 3' }
  if (n.includes('ws') || n.includes('socket'))
                           return { color: 'var(--proto-ws)',      short: 'WS',   dash: '7 3' }
  if (n.includes('dns'))   return { color: 'var(--proto-dns)',     short: 'DNS',  dash: '2 4' }
  return                          { color: 'var(--proto-default)', short: name.toUpperCase().slice(0, 4) }
}

// ── Component ─────────────────────────────────────────

interface Props {
  callbacks:   Callback[]
  ports:       CallbackPort[]
  edges:       HecateStore['activeCallbackEdges']
  onNavigate:  (id: number) => void
  annotations: HecateStore['callbackAnnotations']
  selectedId:  number | null
}

export function PivotGraph({ callbacks, ports, edges, onNavigate, annotations, selectedId }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tx, setTx]       = useState(0)
  const [ty, setTy]       = useState(0)
  const [scale, setScale] = useState(1)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const drag    = useRef<{ ox: number; oy: number; tx: number; ty: number } | null>(null)
  const didDrag = useRef(false)

  const n = callbacks.length
  const orbitR = n <= 1 ? MIN_ORBIT : Math.max(MIN_ORBIT, Math.ceil((n * NODE_GAP) / (2 * Math.PI)))

  // SOCKS port map: callback.id → local_port[]
  const socksMap = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const p of ports) {
      if (p.port_type === 'socks') {
        const arr = m.get(p.callback_id) ?? []
        arr.push(p.local_port)
        m.set(p.callback_id, arr)
      }
    }
    return m
  }, [ports])

  // P2P parent map: child cb.id → { parentId, c2name }
  const parentMap = useMemo(() => {
    const m = new Map<number, { parentId: number; c2name: string }>()
    for (const e of edges) {
      if (e.source_id === e.destination_id) continue
      if (!e.c2profile.is_p2p) continue
      m.set(e.destination_id, { parentId: e.source_id, c2name: e.c2profile.name })
    }
    return m
  }, [edges])

  // Protocol legend entries
  const legendProtos = useMemo(() => {
    const seen = new Map<string, ProtoInfo>()
    for (const cb of callbacks) {
      const info = protoInfo(cb.callbackc2profiles[0]?.c2profile.name ?? '')
      if (!seen.has(info.short)) seen.set(info.short, info)
    }
    return Array.from(seen.values())
  }, [callbacks])

  // Wheel zoom (non-passive)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect   = svg.getBoundingClientRect()
      const mx     = ((e.clientX - rect.left)  / rect.width)  * VBW
      const my     = ((e.clientY - rect.top)   / rect.height) * VBH
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setScale(s => {
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor))
        setTx(t => mx - (mx - t) * (next / s))
        setTy(t => my - (my - t) * (next / s))
        return next
      })
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current = { ox: e.clientX, oy: e.clientY, tx, ty }
    didDrag.current = false
  }, [tx, ty])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    setTx(drag.current.tx + (e.clientX - drag.current.ox) * (VBW / rect.width))
    setTy(drag.current.ty + (e.clientY - drag.current.oy) * (VBH / rect.height))
    didDrag.current = true
  }, [])

  const onMouseUp   = useCallback(() => { drag.current = null }, [])
  const resetView   = useCallback(() => { setTx(0); setTy(0); setScale(1) }, [])
  const isDefault   = tx === 0 && ty === 0 && scale === 1

  return (
    <div className={styles.wrap}>
      {!isDefault && (
        <button className={styles.resetBtn} onClick={resetView} title="Reset view">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 8a6 6 0 1 0 .9-3.2M2 2v3.5h3.5"/>
          </svg>
        </button>
      )}

      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${VBW} ${VBH}`}
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {/* Dot grid */}
          <pattern id="pg-dot" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.7" fill="var(--beige)" fillOpacity="0.08"/>
          </pattern>

          {/* Teal glow */}
          <filter id="pg-gt" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b"/>
            <feFlood floodColor="#3ab8d8" floodOpacity="0.55" result="c"/>
            <feComposite in="c" in2="b" operator="in" result="cb"/>
            <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Crimson glow */}
          <filter id="pg-gc" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="b"/>
            <feFlood floodColor="#c83030" floodOpacity="0.65" result="c"/>
            <feComposite in="c" in2="b" operator="in" result="cb"/>
            <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Node glow (selected/hover) */}
          <filter id="pg-gn" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b"/>
            <feFlood floodColor="rgba(239,239,218,0.35)" floodOpacity="1" result="c"/>
            <feComposite in="c" in2="b" operator="in" result="cb"/>
            <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Annotation glow — dynamic via CSS variable trick: just use teal for simplicity */}
          <filter id="pg-ga" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b"/>
            <feFlood floodColor="#c8b060" floodOpacity="0.5" result="c"/>
            <feComposite in="c" in2="b" operator="in" result="cb"/>
            <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Background ── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="var(--bg-void)"/>
        <rect x="-3000" y="-3000" width="8000" height="8000" fill="url(#pg-dot)"/>

        {/* ── Panned/zoomed content ── */}
        <g transform={`translate(${tx},${ty}) scale(${scale})`}>

          {/* ── Edges (drawn first, under nodes) ── */}
          {callbacks.map((cb, i) => {
            const angle      = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
            const nx         = CX + Math.cos(angle) * orbitR
            const ny         = CY + Math.sin(angle) * orbitR
            const alive      = cb.active
            const isSel      = cb.id === selectedId
            const isHov      = cb.id === hoverId
            const late       = alive && isLateCheckin(cb)
            const hasSocks   = (socksMap.get(cb.id) ?? []).length > 0

            // P2P parent route: anchor line to parent node, use linking c2 profile
            const parent = parentMap.get(cb.id)
            let originX = CX, originY = CY, originR = C2_HEX_R + 3
            let c2name = cb.callbackc2profiles[0]?.c2profile.name ?? ''
            if (parent) {
              const parentIdx = callbacks.findIndex(c => c.id === parent.parentId)
              if (parentIdx >= 0) {
                const pAngle = (parentIdx / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
                originX = CX + Math.cos(pAngle) * orbitR
                originY = CY + Math.sin(pAngle) * orbitR
                originR = NODE_R + 2
                c2name = parent.c2name
              }
            }
            const proto      = protoInfo(c2name)

            // Exact same variables as small NetworkTopology
            const lineColor   = !alive ? 'var(--topo-dead-line)' : proto.color
            const lineDash    = !alive ? '3 3' : late ? '2 8' : proto.dash
            const lineOpacity = alive ? (late ? 0.35 : 0.75) : 0.4

            // Clipped endpoints: origin edge → node edge
            const dx = nx - originX, dy = ny - originY
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const x1 = originX + (dx / len) * originR
            const y1 = originY + (dy / len) * originR
            const x2 = nx - (dx / len) * (NODE_R + 2)
            const y2 = ny - (dy / len) * (NODE_R + 2)
            const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            const mx2 = (x1 + x2) / 2
            const my2 = (y1 + y2) / 2

            return (
              <g key={`edge-${cb.id}`}>
                {/* Base protocol line — exact same as small topo */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={lineColor}
                  strokeWidth={isSel || isHov ? 2.5 : 1.6}
                  strokeDasharray={lineDash}
                  opacity={isSel || isHov ? Math.min(lineOpacity * 1.4, 1) : lineOpacity}
                  style={{ transition: 'opacity 0.2s, stroke-width 0.15s' }}
                />

                {/* SOCKS animated traffic overlay — only when alive */}
                {hasSocks && alive && (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="var(--accent-info)"
                    strokeWidth="2.5"
                    strokeDasharray="9 9"
                    opacity="0.5"
                    filter="url(#pg-gt)"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="0"
                      to={String(-Math.ceil(lineLen / 18) * 18)}
                      dur="1.1s"
                      repeatCount="indefinite"
                    />
                  </line>
                )}

                {/* Protocol label — alive only, same as small topo */}
                {alive && (
                  <g opacity={isSel || isHov ? 1 : 0.65} style={{ transition: 'opacity 0.15s' }}>
                    <rect x={mx2 - 12} y={my2 - 7.5} width={24} height={13} rx="2.5"
                      fill="var(--topo-label-bg)" stroke={lineColor} strokeWidth="0.5" strokeOpacity="0.4"/>
                    <text x={mx2} y={my2 + 3} textAnchor="middle"
                      fontFamily="monospace" fontSize="7" fontWeight="700" fill={lineColor}>
                      {proto.short}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* ── C2 Hub ── */}
          <g filter="url(#pg-gc)">
            <polygon
              points={hexPoints(CX, CY, C2_HEX_R + 6)}
              fill="rgba(140,30,30,0.08)"
              stroke="var(--crimson-700)"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            <polygon
              points={hexPoints(CX, CY, C2_HEX_R)}
              fill="#1c0505"
              stroke="var(--crimson-500)"
              strokeWidth="1.8"
            />
          </g>
          <text x={CX} y={CY - 3} textAnchor="middle"
            fontFamily="monospace" fontSize="6" fontWeight="700"
            fill="var(--crimson-300)" letterSpacing="0.8">MYTHIC</text>
          <text x={CX} y={CY + 6} textAnchor="middle"
            fontFamily="monospace" fontSize="6" fontWeight="700"
            fill="var(--crimson-400)" letterSpacing="1.5">C2</text>

          {/* ── Callback nodes ── */}
          {callbacks.map((cb, i) => {
            const angle    = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
            const nx       = CX + Math.cos(angle) * orbitR
            const ny       = CY + Math.sin(angle) * orbitR
            const alive      = cb.active
            const isSel      = cb.id === selectedId
            const isHov      = cb.id === hoverId
            const late       = alive && isLateCheckin(cb)
            const socksPorts = socksMap.get(cb.id) ?? []
            const hasSocks   = socksPorts.length > 0
            const annotColor = annotations[cb.display_id] ?? null

            // Use P2P link c2 profile if this callback is a child of another callback
            const p2pParent = parentMap.get(cb.id)
            const nodeC2name = p2pParent ? p2pParent.c2name : (cb.callbackc2profiles[0]?.c2profile.name ?? '')
            const lineColor2  = !alive ? 'var(--topo-dead-line)' : protoInfo(nodeC2name).color
            const nodeStroke  = hasSocks && alive ? '#3ab8d8'
              : annotColor || (alive ? lineColor2 : 'var(--topo-dead-line)')
            const nodeFill    = annotColor
              ? (isSel ? `${annotColor}40` : `${annotColor}22`)
              : (isSel ? 'var(--topo-node-sel)' : 'var(--topo-node-bg)')
            const strokeW     = isSel ? 2.8 : hasSocks && alive ? 2.2 : (annotColor ? 2 : 1.4)
            const strokeOpacity = isSel ? 1 : (alive ? (annotColor ? 0.9 : 0.6) : 1)
            const nodeFilter  = hasSocks && alive ? 'url(#pg-gt)'
              : isSel ? 'url(#pg-gn)'
              : undefined

            // Label — pushed outward from orbit
            const labelR   = orbitR + NODE_R + 18
            const labelX   = CX + Math.cos(angle) * labelR
            const labelY   = CY + Math.sin(angle) * labelR
            const hostname = cb.host.length > 15 ? cb.host.slice(0, 13) + '…' : cb.host
            const hpw      = Math.max(hostname.length * 5.8, 32) + 10

            // SOCKS badges — stacked outward from center, between C2 and node
            const badgeR  = orbitR - NODE_R - 16
            const badgeX  = CX + Math.cos(angle) * badgeR
            const badgeY  = CY + Math.sin(angle) * badgeR

            return (
              <g
                key={`node-${cb.id}`}
                style={{ cursor: 'pointer' }}
                onClick={() => { if (!didDrag.current) onNavigate(cb.id) }}
                onMouseEnter={() => setHoverId(cb.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                {/* SOCKS pulse ring — outermost */}
                {hasSocks && alive && (
                  <circle cx={nx} cy={ny} r={NODE_R + 5} fill="none" stroke="var(--accent-info)" strokeWidth="1.2">
                    <animate attributeName="r"
                      values={`${NODE_R + 4};${NODE_R + 16};${NODE_R + 4}`}
                      dur="2.6s" repeatCount="indefinite"/>
                    <animate attributeName="opacity"
                      values="0.65;0;0.65"
                      dur="2.6s" repeatCount="indefinite"/>
                  </circle>
                )}

                {/* Hover / selected ring */}
                {(isSel || isHov) && (
                  <circle cx={nx} cy={ny} r={NODE_R + 5}
                    fill="none"
                    stroke={nodeStroke}
                    strokeWidth="1.2"
                    opacity={isSel ? 0.5 : 0.25}
                    style={{ transition: 'opacity 0.15s' }}
                  />
                )}

                {/* Main circle — same fill/stroke logic as small topo */}
                <circle
                  cx={nx} cy={ny} r={NODE_R}
                  fill={nodeFill}
                  stroke={nodeStroke}
                  strokeWidth={strokeW}
                  strokeOpacity={strokeOpacity}
                  filter={nodeFilter}
                  style={{ transition: 'stroke-width 0.15s' }}
                />

                {/* Agent icon */}
                <image
                  href={`/static/${cb.payload.payloadtype.name}_dark.svg`}
                  x={nx - 13} y={ny - 13}
                  width="26" height="26"
                  opacity={alive ? 1 : 0.4}
                />

                {/* Live pulse dot — hidden when late or dead, same as small topo */}
                {alive && !late && (
                  <circle
                    cx={nx + NODE_R - 4} cy={ny - NODE_R + 4}
                    r="4"
                    fill="var(--status-alive)"
                    stroke="var(--bg-void)"
                    strokeWidth="1.2"
                  />
                )}

                {/* SOCKS port badges */}
                {hasSocks && alive && socksPorts.slice(0, 3).map((port, pi) => {
                  const txt = `:${port}`
                  const bw  = txt.length * 5.8 + 10
                  // Stack perpendicular to radial direction
                  const perp = angle + Math.PI / 2
                  const bpx  = badgeX + Math.cos(perp) * (pi - (Math.min(socksPorts.length, 3) - 1) / 2) * 0
                  const bpy  = badgeY + pi * -15
                  return (
                    <g key={port} filter="url(#pg-gt)">
                      <rect x={bpx - bw / 2} y={bpy - 6} width={bw} height={12} rx="3"
                        fill="var(--topo-label-bg)" stroke="var(--accent-info)" strokeWidth="0.9"/>
                      <text x={bpx} y={bpy + 3} textAnchor="middle"
                        fontFamily="monospace" fontSize="7" fontWeight="700" fill="var(--accent-info)">
                        {txt}
                      </text>
                    </g>
                  )
                })}
                {hasSocks && socksPorts.length > 3 && (
                  <g>
                    <rect x={badgeX - 14} y={badgeY - 6 - 3 * 15} width={28} height={12} rx="3"
                      fill="var(--topo-label-bg)" stroke="var(--accent-info)" strokeWidth="0.9"/>
                    <text x={badgeX} y={badgeY + 3 - 3 * 15} textAnchor="middle"
                      fontFamily="monospace" fontSize="6.5" fontWeight="700" fill="var(--accent-info)">
                      +{socksPorts.length - 3}
                    </text>
                  </g>
                )}

                {/* Hostname label pill */}
                <g style={{ transition: 'opacity 0.15s' }} opacity={alive ? 1 : 0.45}>
                  <rect
                    x={labelX - hpw / 2} y={labelY - 8}
                    width={hpw} height={14} rx="3"
                    fill="var(--topo-label-bg)"
                    stroke={isSel ? nodeStroke : 'var(--beige-border)'}
                    strokeWidth={isSel ? 0.8 : 0.5}
                  />
                  <text x={labelX} y={labelY + 2.5} textAnchor="middle"
                    fontFamily="monospace" fontSize="7.5"
                    fontWeight={annotColor ? '700' : (isSel || hasSocks ? '700' : '400')}
                    fill={
                      annotColor ? annotColor
                      : isSel ? 'var(--topo-text-node-sel)'
                      : hasSocks && alive ? 'var(--accent-info)'
                      : 'var(--topo-text-node)'
                    }
                  >
                    {hostname}
                  </text>
                </g>
                {/* Display ID */}
                <text x={labelX} y={labelY + 14} textAnchor="middle"
                  fontFamily="monospace" fontSize="6" fill="var(--topo-text-info)">
                  #{cb.display_id}
                </text>
              </g>
            )
          })}

          {/* ── Empty state ── */}
          {n === 0 && (
            <text x={CX} y={CY + 50} textAnchor="middle"
              fontFamily="monospace" fontSize="12" fill="var(--topo-text-info)" opacity="0.5">
              no agents
            </text>
          )}
        </g>

        {/* ── Protocol legend (fixed, outside transform) ── */}
        {legendProtos.length > 0 && (
          <g transform={`translate(16, ${VBH - 18})`}>
            {legendProtos.map((p, i) => (
              <g key={p.short} transform={`translate(${i * 58}, 0)`}>
                <line x1="0" y1="5" x2="14" y2="5"
                  stroke={p.color} strokeWidth="1.8" strokeDasharray={p.dash}/>
                <text x="18" y="8.5" fontFamily="monospace" fontSize="7.5"
                  fontWeight="700" fill={p.color} opacity="0.8">
                  {p.short}
                </text>
              </g>
            ))}
            {/* SOCKS indicator */}
            {ports.some(p => p.port_type === 'socks') && (
              <g transform={`translate(${legendProtos.length * 58}, 0)`}>
                <line x1="0" y1="5" x2="14" y2="5"
                  stroke="var(--accent-info)" strokeWidth="2" strokeDasharray="5 4"/>
                <text x="18" y="8.5" fontFamily="monospace" fontSize="7.5"
                  fontWeight="700" fill="var(--accent-info)" opacity="0.8">
                  SOCKS
                </text>
              </g>
            )}
          </g>
        )}

        {/* ── Hint ── */}
        <text x={VBW / 2} y={VBH - 6} textAnchor="middle"
          fontFamily="monospace" fontSize="6.5" fill="rgba(180,160,130,0.15)">
          scroll to zoom · drag to pan · click node to navigate
        </text>
      </svg>
    </div>
  )
}
