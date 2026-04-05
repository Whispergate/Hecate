/* ═══════════════════════════════════════════════════
   hecate/src/components/shared/WgSigil.tsx
   WhisperGate-inspired hexagonal sigil
   ═══════════════════════════════════════════════════ */

interface WgSigilProps {
  size?: number
  className?: string
}

export function WgSigil({ size = 28, className }: WgSigilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer hexagon */}
      <polygon
        points="50,4 93,27 93,73 50,96 7,73 7,27"
        fill="#1a0808"
        stroke="var(--crimson-600)"
        strokeWidth="3"
      />
      {/* Inner hexagon */}
      <polygon
        points="50,14 84,32 84,68 50,86 16,68 16,32"
        fill="#2a0e0e"
        stroke="var(--crimson-900)"
        strokeWidth="1.5"
      />
      {/* 4 cardinal spikes */}
      <polygon points="50,16 54,42 50,46 46,42" fill="#0e0404" stroke="#4a0e0e" strokeWidth="1" />
      <polygon points="50,84 54,58 50,54 46,58" fill="#0e0404" stroke="#4a0e0e" strokeWidth="1" />
      <polygon points="16,50 42,46 46,50 42,54" fill="#0e0404" stroke="#4a0e0e" strokeWidth="1" />
      <polygon points="84,50 58,46 54,50 58,54" fill="#0e0404" stroke="#4a0e0e" strokeWidth="1" />
      {/* Eye body */}
      <ellipse cx="50" cy="50" rx="16" ry="11" fill="#3a2020" stroke="var(--crimson-700)" strokeWidth="1.5" />
      {/* Iris rings */}
      <circle cx="50" cy="50" r="7"   fill="none" stroke="var(--crimson-600)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="3.5" fill="var(--crimson-400)" opacity="0.6" />
      <circle cx="50" cy="50" r="1.5" fill="var(--bone-100)" />
      {/* Slash */}
      <line x1="25" y1="72" x2="75" y2="28" stroke="#0e0404" strokeWidth="5"  strokeLinecap="round" />
      <line x1="25" y1="72" x2="75" y2="28" stroke="#1a0808" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
