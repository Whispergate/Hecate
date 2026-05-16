// Single source of truth for agent identity colors.
// Tokens live in styles/tokens.css and switch per theme.

export function agentColor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('apollo'))          return 'var(--agent-apollo)'
  if (n.includes('poseidon'))        return 'var(--agent-poseidon)'
  if (n.includes('medusa'))          return 'var(--agent-medusa)'
  if (n.includes('hermes'))          return 'var(--agent-hermes)'
  if (n.includes('thanatos'))        return 'var(--agent-thanatos)'
  if (n.includes('athena'))          return 'var(--agent-athena)'
  if (n.includes('merlin'))          return 'var(--agent-merlin)'
  if (n.includes('freyja'))          return 'var(--agent-freyja)'
  if (n.includes('arachne'))         return 'var(--agent-arachne)'
  if (n.includes('atlas'))           return 'var(--agent-atlas)'
  if (n.includes('nimplant'))        return 'var(--agent-nimplant)'
  if (n.includes('xenon'))           return 'var(--agent-xenon)'
  if (n.includes('forgemaster'))     return 'var(--agent-forgemaster)'
  if (n.includes('service_wrapper')) return 'var(--agent-service-wrapper)'
  // Deterministic HSL fallback — distinct hue per unknown agent name.
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 55%, 45%)`
}
